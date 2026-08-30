import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_WORKSPACE_DEVICE_STORAGE_KEY =
  "saledock-workspace-device-id";
export const ACTIVE_WORKSPACE_TAB_STORAGE_KEY =
  "saledock-workspace-tab-state-v1";
export const ACTIVE_WORKSPACE_POLL_INTERVAL_MS = 5_000;
export const ACTIVE_WORKSPACE_COLLISION_WINDOW_MS = 180;

export type ActiveWorkspaceLease = {
  deviceId: string;
  tabId: string;
  generation: number;
  claimedAt: string;
  heartbeatAt: string;
  updatedAt: string;
};

export type ActiveWorkspaceTabState = {
  userId: string;
  tabId: string;
  status: "active" | "paused" | "new";
  generation: number | null;
};

export type InitialWorkspaceIdentity = {
  deviceId: string;
  tabId: string;
  previousStatus: "active" | "paused" | null;
  previousGeneration: number | null;
  isNewWorkspace: boolean;
};

export type WorkspaceMessageChannel = {
  postMessage: (value: unknown) => void;
  close: () => void;
};

type LeaseRow = {
  device_id?: unknown;
  tab_id?: unknown;
  generation?: unknown;
  claimed_at?: unknown;
  heartbeat_at?: unknown;
  updated_at?: unknown;
};

function secureUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function createWorkspaceContextId(): string {
  return secureUuid();
}

function readStoredTabState(): ActiveWorkspaceTabState | null {
  const raw = sessionStorage.getItem(ACTIVE_WORKSPACE_TAB_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveWorkspaceTabState>;
    const generation = parsed.generation;
    if (
      !isUuid(parsed.userId) ||
      !isUuid(parsed.tabId) ||
      (parsed.status !== "active" &&
        parsed.status !== "paused" &&
        parsed.status !== "new") ||
      (generation !== null &&
        (typeof generation !== "number" ||
          !Number.isSafeInteger(generation) ||
          generation < 1))
    ) {
      return null;
    }
    return parsed as ActiveWorkspaceTabState;
  } catch {
    return null;
  }
}

export function initializeWorkspaceIdentity(
  userId: string,
): InitialWorkspaceIdentity {
  let deviceId = localStorage.getItem(ACTIVE_WORKSPACE_DEVICE_STORAGE_KEY);
  if (!isUuid(deviceId)) {
    deviceId = secureUuid();
    localStorage.setItem(ACTIVE_WORKSPACE_DEVICE_STORAGE_KEY, deviceId);
  }

  const stored = readStoredTabState();
  if (!stored || stored.userId !== userId) {
    const tabId = secureUuid();
    sessionStorage.setItem(
      ACTIVE_WORKSPACE_TAB_STORAGE_KEY,
      JSON.stringify({
        userId,
        tabId,
        status: "new",
        generation: null,
      } satisfies ActiveWorkspaceTabState),
    );
    return {
      deviceId,
      tabId,
      previousStatus: null,
      previousGeneration: null,
      isNewWorkspace: true,
    };
  }

  return {
    deviceId,
    tabId: stored.tabId,
    previousStatus: stored.status === "new" ? null : stored.status,
    previousGeneration: stored.generation,
    isNewWorkspace: stored.status === "new",
  };
}

export function replaceDuplicatedTabIdentity(
  userId: string,
  identity: InitialWorkspaceIdentity,
): InitialWorkspaceIdentity {
  const tabId = secureUuid();
  sessionStorage.setItem(
    ACTIVE_WORKSPACE_TAB_STORAGE_KEY,
    JSON.stringify({
      userId,
      tabId,
      status: "new",
      generation: null,
    } satisfies ActiveWorkspaceTabState),
  );
  return {
    ...identity,
    tabId,
    previousStatus: null,
    previousGeneration: null,
    isNewWorkspace: true,
  };
}

export function persistWorkspaceTabState(
  userId: string,
  tabId: string,
  status: "active" | "paused",
  generation: number | null,
): void {
  sessionStorage.setItem(
    ACTIVE_WORKSPACE_TAB_STORAGE_KEY,
    JSON.stringify({ userId, tabId, status, generation } satisfies ActiveWorkspaceTabState),
  );
}

export function workspaceChannelName(userId: string): string {
  return `saledock-active-workspace:${userId}`;
}

export function createWorkspaceMessageChannel(
  name: string,
  onMessage: (value: unknown) => void,
): WorkspaceMessageChannel {
  const BroadcastChannelConstructor = window.BroadcastChannel;
  if (typeof BroadcastChannelConstructor === "function") {
    const channel = new BroadcastChannelConstructor(name);
    const handleMessage = (event: MessageEvent<unknown>) => {
      onMessage(event.data);
    };
    channel.addEventListener("message", handleMessage);
    return {
      postMessage: (value) => channel.postMessage(value),
      close: () => {
        channel.removeEventListener("message", handleMessage);
        channel.close();
      },
    };
  }

  const storageKey = `${name}:event`;
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      const envelope = JSON.parse(event.newValue) as { value?: unknown };
      onMessage(envelope.value);
    } catch {
      // A malformed local event cannot override the database lease.
    }
  };
  window.addEventListener("storage", handleStorage);

  return {
    postMessage: (value) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ messageId: secureUuid(), value }),
        );
        localStorage.removeItem(storageKey);
      } catch {
        // Polling remains authoritative when browser storage is unavailable.
      }
    },
    close: () => window.removeEventListener("storage", handleStorage),
  };
}

export function leaseBelongsTo(
  lease: ActiveWorkspaceLease | null,
  deviceId: string,
  tabId: string,
  generation?: number | null,
): boolean {
  return Boolean(
    lease &&
      lease.deviceId === deviceId &&
      lease.tabId === tabId &&
      (generation == null || lease.generation === generation),
  );
}

function parseLeaseRow(value: unknown): ActiveWorkspaceLease | null {
  if (!value || typeof value !== "object") return null;
  const row = value as LeaseRow;
  if (
    !isUuid(row.device_id) ||
    !isUuid(row.tab_id) ||
    !Number.isSafeInteger(row.generation) ||
    Number(row.generation) < 1 ||
    typeof row.claimed_at !== "string" ||
    typeof row.heartbeat_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    throw new Error("The active workspace lease response was invalid.");
  }
  return {
    deviceId: row.device_id,
    tabId: row.tab_id,
    generation: Number(row.generation),
    claimedAt: row.claimed_at,
    heartbeatAt: row.heartbeat_at,
    updatedAt: row.updated_at,
  };
}

function firstLeaseRow(data: unknown): ActiveWorkspaceLease | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  return parseLeaseRow(data[0]);
}

export async function claimActiveWorkspace(
  supabase: SupabaseClient,
  deviceId: string,
  tabId: string,
): Promise<ActiveWorkspaceLease> {
  const { data, error } = await supabase.rpc("claim_active_workspace", {
    p_device_id: deviceId,
    p_tab_id: tabId,
  });
  if (error) throw error;
  const lease = firstLeaseRow(data);
  if (!lease) throw new Error("The active workspace claim returned no lease.");
  return lease;
}

export async function getActiveWorkspace(
  supabase: SupabaseClient,
): Promise<ActiveWorkspaceLease | null> {
  const { data, error } = await supabase.rpc("get_active_workspace");
  if (error) throw error;
  return firstLeaseRow(data);
}

export async function heartbeatActiveWorkspace(
  supabase: SupabaseClient,
  deviceId: string,
  tabId: string,
  generation: number,
): Promise<ActiveWorkspaceLease | null> {
  const { data, error } = await supabase.rpc("heartbeat_active_workspace", {
    p_device_id: deviceId,
    p_tab_id: tabId,
    p_generation: generation,
  });
  if (error) throw error;
  return firstLeaseRow(data);
}

export async function releaseActiveWorkspace(
  supabase: SupabaseClient,
  deviceId: string,
  tabId: string,
  generation: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("release_active_workspace", {
    p_device_id: deviceId,
    p_tab_id: tabId,
    p_generation: generation,
  });
  if (error) throw error;
  return data === true;
}
