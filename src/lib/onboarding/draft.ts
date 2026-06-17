export const ONBOARDING_STEPS = ["profile", "shop", "branch", "branding", "confirm"] as const;

export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_DRAFT_FIELDS = [
  "fullName",
  "username",
  "phone",
  "profilePictureUrl",
  "organizationName",
  "ownerName",
  "orgPhone",
  "orgWhatsapp",
  "orgEmail",
  "orgAddress",
  "currencyCode",
  "timezone",
  "googleMapsUrl",
  "latitude",
  "longitude",
  "showMap",
  "socialLinks",
  "branchName",
  "branchPhone",
  "branchAddress",
  "branchGoogleMapsUrl",
  "branchLatitude",
  "branchLongitude",
  "branchUseShopDetails",
  "logoUrl",
  "primaryColor",
  "accentColor",
  "defaultTheme",
] as const;

export type OnboardingDraftField = (typeof ONBOARDING_DRAFT_FIELDS)[number];
export type OnboardingDraftData = Partial<Record<OnboardingDraftField, string>>;

export type OnboardingDraftSnapshot = {
  currentStep: OnboardingStepName;
  completedSteps: OnboardingStepName[];
  draftData: OnboardingDraftData;
  updatedAt: string | null;
} | null;

export function isOnboardingStepName(value: unknown): value is OnboardingStepName {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export function normalizeOnboardingStep(value: unknown): OnboardingStepName {
  return isOnboardingStepName(value) ? value : "profile";
}

export function normalizeCompletedSteps(value: unknown): OnboardingStepName[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isOnboardingStepName);
}

export function sanitizeOnboardingDraftData(value: unknown): OnboardingDraftData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const output: OnboardingDraftData = {};
  for (const key of ONBOARDING_DRAFT_FIELDS) {
    const raw = source[key];
    if (typeof raw === "string") {
      output[key] = raw.slice(0, 5000);
    }
  }
  return output;
}
