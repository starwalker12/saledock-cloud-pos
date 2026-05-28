export type LinkedProviders = {
  hasPassword: boolean;
  hasGoogle: boolean;
  hasFacebook: boolean;
  providers: string[];
  identityCount: number;
};

function normalizeProvider(provider: string): string {
  if (provider === "facebook_oidc" || provider === "facebook") return "facebook";
  if (provider === "google") return "google";
  if (provider === "email") return "email";
  return provider;
}

export function getLinkedProviders(
  user?: {
    identities?: { provider: string; id: string }[] | null;
    app_metadata?: {
      provider?: string;
      providers?: string[];
    };
  } | null,
): LinkedProviders {
  const seen = new Set<string>();

  for (const identity of user?.identities ?? []) {
    seen.add(normalizeProvider(identity.provider));
  }

  if (user?.app_metadata?.provider) {
    seen.add(normalizeProvider(user.app_metadata.provider));
  }

  for (const p of user?.app_metadata?.providers ?? []) {
    seen.add(normalizeProvider(p));
  }

  const providers = Array.from(seen);

  return {
    hasPassword: providers.includes("email"),
    hasGoogle: providers.includes("google"),
    hasFacebook: providers.includes("facebook"),
    providers,
    identityCount: providers.length,
  };
}
