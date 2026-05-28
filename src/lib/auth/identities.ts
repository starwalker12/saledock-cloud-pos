export type LinkedProviders = {
  hasPassword: boolean;
  hasGoogle: boolean;
  hasFacebook: boolean;
  providers: string[];
  identityCount: number;
};

export function getLinkedProviders(
  identities?: { provider: string; id: string }[],
): LinkedProviders {
  const providers = (identities ?? []).map((i) => i.provider);
  const hasPassword = providers.includes("email");
  const hasGoogle = providers.includes("google");
  const hasFacebook = providers.includes("facebook");

  return {
    hasPassword,
    hasGoogle,
    hasFacebook,
    providers,
    identityCount: providers.length,
  };
}
