// riasly — which OAuth providers are actually configured, so the UI never renders
// a sign-in button whose secret is missing. Reads env, so it runs on the server.
export type OAuthProvider = "google" | "github" | "discord";

/**
 * Returns the OAuth providers that have both client id + secret configured.
 * Used to conditionally render provider buttons so missing secrets never
 * produce broken sign-in flows.
 */
export function getEnabledOAuthProviders(): OAuthProvider[] {
  const enabled: OAuthProvider[] = [];
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
    enabled.push("google");
  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)
    enabled.push("github");
  if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET)
    enabled.push("discord");
  return enabled;
}
