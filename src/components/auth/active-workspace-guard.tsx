"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";
import { ActiveWorkspacePausedDialog } from "@/components/auth/active-workspace-paused-dialog";
import {
  ACTIVE_WORKSPACE_COLLISION_WINDOW_MS,
  ACTIVE_WORKSPACE_POLL_INTERVAL_MS,
  claimActiveWorkspace,
  createWorkspaceMessageChannel,
  createWorkspaceContextId,
  getActiveWorkspace,
  heartbeatActiveWorkspace,
  initializeWorkspaceIdentity,
  leaseBelongsTo,
  persistWorkspaceTabState,
  releaseActiveWorkspace,
  replaceDuplicatedTabIdentity,
  workspaceChannelName,
  type ActiveWorkspaceLease,
  type InitialWorkspaceIdentity,
  type WorkspaceMessageChannel,
} from "@/lib/active-workspace";
import { createClient } from "@/lib/supabase/client";

type WorkspaceGuardStatus = "checking" | "active" | "paused";

type WorkspaceBroadcastMessage =
  | { type: "tab-probe"; tabId: string; contextId: string }
  | { type: "tab-present"; tabId: string; targetContextId: string }
  | { type: "lease-changed" };

type ActiveWorkspaceContextValue = {
  releaseForSignOut: () => Promise<void>;
};

const ActiveWorkspaceContext = createContext<ActiveWorkspaceContextValue | null>(
  null,
);

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function ActiveWorkspaceGuard({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<WorkspaceGuardStatus>("checking");
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const [hasCoordinationWarning, setHasCoordinationWarning] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const statusRef = useRef<WorkspaceGuardStatus>("checking");
  const userIdRef = useRef<string | null>(null);
  const identityRef = useRef<InitialWorkspaceIdentity | null>(null);
  const ownedGenerationRef = useRef<number | null>(null);
  const channelRef = useRef<WorkspaceMessageChannel | null>(null);
  const failureCountRef = useRef(0);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const queueOperation = useCallback(<T,>(operation: () => Promise<T>) => {
    const queued = operationQueueRef.current.then(operation, operation);
    operationQueueRef.current = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }, []);

  const markActive = useCallback((lease: ActiveWorkspaceLease) => {
    const identity = identityRef.current;
    const userId = userIdRef.current;
    if (!identity || !userId) return;

    ownedGenerationRef.current = lease.generation;
    statusRef.current = "active";
    persistWorkspaceTabState(
      userId,
      identity.tabId,
      "active",
      lease.generation,
    );
    failureCountRef.current = 0;
    setHasCoordinationWarning(false);
    setInitializationError(null);
    setClaimError(null);
    setStatus("active");
  }, []);

  const markPaused = useCallback(() => {
    const identity = identityRef.current;
    const userId = userIdRef.current;
    if (!identity || !userId) return;

    statusRef.current = "paused";
    persistWorkspaceTabState(
      userId,
      identity.tabId,
      "paused",
      ownedGenerationRef.current,
    );
    setInitializationError(null);
    setStatus("paused");
  }, []);

  const noteCoordinationFailure = useCallback(() => {
    failureCountRef.current += 1;
    if (failureCountRef.current >= 3) setHasCoordinationWarning(true);
  }, []);

  const verifyOwnership = useCallback(async () => {
    const identity = identityRef.current;
    if (!identity) return;

    try {
      const generation = ownedGenerationRef.current;
      const lease =
        statusRef.current === "active" && generation !== null
          ? await heartbeatActiveWorkspace(
              supabase,
              identity.deviceId,
              identity.tabId,
              generation,
            )
          : await getActiveWorkspace(supabase);

      failureCountRef.current = 0;
      setHasCoordinationWarning(false);

      if (
        statusRef.current === "active" &&
        !leaseBelongsTo(
          lease,
          identity.deviceId,
          identity.tabId,
          ownedGenerationRef.current,
        )
      ) {
        markPaused();
      }
    } catch {
      noteCoordinationFailure();
    }
  }, [markPaused, noteCoordinationFailure, supabase]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    let channel: WorkspaceMessageChannel | null = null;

    async function initialize() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error("The authenticated session could not be confirmed.");
        }
        if (cancelled) return;

        userIdRef.current = user.id;
        let identity = initializeWorkspaceIdentity(user.id);
        ownedGenerationRef.current = identity.previousGeneration;
        identityRef.current = identity;

        const contextId = createWorkspaceContextId();
        let duplicateTabDetected = false;
        channel = createWorkspaceMessageChannel(
          workspaceChannelName(user.id),
          (value) => {
          if (!value || typeof value !== "object") return;
          const message = value as Partial<WorkspaceBroadcastMessage>;
          const currentIdentity = identityRef.current;
          if (!currentIdentity) return;

          if (
            message.type === "tab-probe" &&
            message.tabId === currentIdentity.tabId &&
            typeof message.contextId === "string" &&
            message.contextId !== contextId
          ) {
            channel?.postMessage({
              type: "tab-present",
              tabId: currentIdentity.tabId,
              targetContextId: message.contextId,
            } satisfies WorkspaceBroadcastMessage);
            return;
          }

          if (
            message.type === "tab-present" &&
            message.tabId === currentIdentity.tabId &&
            message.targetContextId === contextId
          ) {
            duplicateTabDetected = true;
            return;
          }

          if (message.type === "lease-changed") {
            void queueOperation(verifyOwnership);
          }
          },
        );
        channelRef.current = channel;

        channel.postMessage({
          type: "tab-probe",
          tabId: identity.tabId,
          contextId,
        } satisfies WorkspaceBroadcastMessage);
        await wait(ACTIVE_WORKSPACE_COLLISION_WINDOW_MS);
        if (cancelled) return;

        if (duplicateTabDetected) {
          identity = replaceDuplicatedTabIdentity(user.id, identity);
          identityRef.current = identity;
          ownedGenerationRef.current = null;
        }

        if (identity.isNewWorkspace) {
          const lease = await claimActiveWorkspace(
            supabase,
            identity.deviceId,
            identity.tabId,
          );
          if (cancelled) return;
          if (!leaseBelongsTo(lease, identity.deviceId, identity.tabId)) {
            throw new Error("The new workspace claim could not be confirmed.");
          }
          markActive(lease);
          channel.postMessage({ type: "lease-changed" } satisfies WorkspaceBroadcastMessage);
        } else {
          const lease = await getActiveWorkspace(supabase);
          if (cancelled) return;

          if (
            identity.previousStatus === "active" &&
            identity.previousGeneration !== null &&
            leaseBelongsTo(
              lease,
              identity.deviceId,
              identity.tabId,
              identity.previousGeneration,
            )
          ) {
            markActive(lease as ActiveWorkspaceLease);
          } else if (
            identity.previousStatus === "active" &&
            lease === null
          ) {
            const reclaimed = await claimActiveWorkspace(
              supabase,
              identity.deviceId,
              identity.tabId,
            );
            if (cancelled) return;
            markActive(reclaimed);
            channel.postMessage({ type: "lease-changed" } satisfies WorkspaceBroadcastMessage);
          } else {
            markPaused();
          }
        }

        intervalId = window.setInterval(() => {
          void queueOperation(verifyOwnership);
        }, ACTIVE_WORKSPACE_POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        statusRef.current = "checking";
        setStatus("checking");
        setInitializationError(
          "Session coordination is temporarily unavailable. Check your connection and try again.",
        );
      }
    }

    function handleResume() {
      if (document.visibilityState === "visible") {
        void queueOperation(verifyOwnership);
      }
    }

    void initialize();
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
      channel?.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [
    markActive,
    markPaused,
    queueOperation,
    retryKey,
    supabase,
    verifyOwnership,
  ]);

  const takeControl = useCallback(async () => {
    const identity = identityRef.current;
    if (!identity || isClaiming) return;

    setIsClaiming(true);
    setClaimError(null);
    try {
      await queueOperation(async () => {
        let lease: ActiveWorkspaceLease | null = null;
        try {
          lease = await claimActiveWorkspace(
            supabase,
            identity.deviceId,
            identity.tabId,
          );
        } catch (claimFailure) {
          const authoritativeLease = await getActiveWorkspace(supabase).catch(
            () => null,
          );
          if (
            !leaseBelongsTo(
              authoritativeLease,
              identity.deviceId,
              identity.tabId,
            )
          ) {
            throw claimFailure;
          }
          lease = authoritativeLease;
        }

        if (!leaseBelongsTo(lease, identity.deviceId, identity.tabId)) {
          throw new Error("Control could not be confirmed for this workspace.");
        }
        markActive(lease as ActiveWorkspaceLease);
        channelRef.current?.postMessage({
          type: "lease-changed",
        } satisfies WorkspaceBroadcastMessage);
      });
    } catch {
      setClaimError("Could not take control. Check your connection and try again.");
      markPaused();
    } finally {
      setIsClaiming(false);
    }
  }, [isClaiming, markActive, markPaused, queueOperation, supabase]);

  const releaseForSignOut = useCallback(async () => {
    const identity = identityRef.current;
    const generation = ownedGenerationRef.current;
    if (!identity || generation === null) return;

    await Promise.race([
      releaseActiveWorkspace(
        supabase,
        identity.deviceId,
        identity.tabId,
        generation,
      ).catch(() => false),
      wait(1_200).then(() => false),
    ]);
    channelRef.current?.postMessage({
      type: "lease-changed",
    } satisfies WorkspaceBroadcastMessage);
  }, [supabase]);

  const contextValue = useMemo<ActiveWorkspaceContextValue>(
    () => ({ releaseForSignOut }),
    [releaseForSignOut],
  );
  const isBlocked = status !== "active";

  const retryInitialization = useCallback(() => {
    statusRef.current = "checking";
    setInitializationError(null);
    setStatus("checking");
    setRetryKey((value) => value + 1);
  }, []);

  return (
    <ActiveWorkspaceContext.Provider value={contextValue}>
      <div
        data-active-workspace-guard
        data-active-workspace-state={status}
        className="contents"
      >
        <div
          data-active-workspace-content
          className="contents"
          inert={isBlocked ? true : undefined}
          aria-hidden={isBlocked ? true : undefined}
        >
          {children}
        </div>

        {status === "checking" && (
          <div className="fixed inset-0 z-[10000] flex min-h-dvh items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px] print:hidden">
            <div
              role={initializationError ? "alertdialog" : "status"}
              aria-modal={initializationError ? "true" : undefined}
              aria-live="polite"
              className="w-full max-w-sm rounded-lg border border-slate-200 bg-[#fff] p-5 text-center text-slate-950 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            >
              {initializationError ? (
                <>
                  <h2 className="text-base font-black">Session check unavailable</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {initializationError}
                  </p>
                  <button
                    type="button"
                    autoFocus
                    onClick={retryInitialization}
                    className="motion-press mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary-accent-bg)] px-4 py-2.5 text-sm font-black text-[var(--primary-accent-text)] hover:bg-[var(--primary-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    Try again
                  </button>
                </>
              ) : (
                <div className="flex items-center justify-center gap-3 text-sm font-bold">
                  <span
                    className="size-5 animate-spin rounded-full border-2 border-cyan-700 border-t-transparent motion-reduce:animate-none dark:border-cyan-300 dark:border-t-transparent"
                    aria-hidden="true"
                  />
                  Checking session...
                </div>
              )}
            </div>
          </div>
        )}

        {status === "paused" && (
          <ActiveWorkspacePausedDialog
            claimError={claimError}
            isClaiming={isClaiming}
            onUseHere={takeControl}
            onBeforeSignOut={releaseForSignOut}
          />
        )}

        {status === "active" && hasCoordinationWarning && (
          <div
            role="status"
            className="fixed inset-x-3 top-3 z-[270] mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-900 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          >
            Session coordination is reconnecting. Your sign-in remains active.
          </div>
        )}
      </div>
    </ActiveWorkspaceContext.Provider>
  );
}

export function useActiveWorkspace() {
  const context = useContext(ActiveWorkspaceContext);
  if (!context) {
    throw new Error(
      "useActiveWorkspace must be used inside ActiveWorkspaceGuard",
    );
  }
  return context;
}
