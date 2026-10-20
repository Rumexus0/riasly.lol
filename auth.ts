import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Discord from "next-auth/providers/discord";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";
import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { maybeJoinOwnGuild } from "@/lib/discord-guild";
import {
  consumeBackupCode,
  matchBackupCode,
  verifyTotp,
} from "@/lib/two-factor";
import { verifyAndConsumeLoginOtp } from "@/lib/login-otp";
import authConfig from "./auth.config";

// Build the provider list dynamically. OAuth providers are only enabled
// when their env keys exist, so a missing secret never breaks the build/login.
const oauthProviders = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  // Link a Google sign-in to the account that already owns the address instead of
  // refusing. Without this, a person who claimed their handle with an email+password
  // and then presses "Continue with Google" gets /login?error=OAuthAccountNotLinked:
  // Auth.js will not attach a provider to an existing user unless the visitor is
  // already signed in (handle-login.ts throws OAuthAccountNotLinked on purpose).
  // The name says "dangerous" because it trusts the provider's address claim, and
  // Google is the one provider here whose claim is worth trusting: it only returns
  // an account's own, verified mailbox, so proving Google access is proving the inbox
  // — the same proof our own verification code carries. It also means a signup whose
  // confirmation mail never arrived can get in through Google rather than being
  // stranded. GitHub and Discord are left strict: GitHub will happily return an
  // unverified address, and Discord's is not the identity anyone here owns a profile
  // by. The real cost is the account-recovery path — if a Gmail is lost and the
  // address changes hands, whoever holds it now holds this riasly account too.
  oauthProviders.push(Google({ allowDangerousEmailAccountLinking: true }));
}
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  oauthProviders.push(GitHub);
}
if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
  // Discord is both a login method AND the "connect Discord" action (the same
  // provider, linked to the already-signed-in user by Auth.js via linkAccount).
  //  - prompt=consent  -> Discord always shows its own authorisation screen (the
  //    "this app can access your username, avatar and banner" list), which is what
  //    makes the connection an explicit, revocable grant instead of a silent one.
  //  - prompt=consent  -> Discord also returns a refresh_token. Without it the
  //    access token dies after ~7 days and the profile card silently disappears.
  //  - scope           -> `identify` is everything the card needs (id, username,
  //    avatar, banner, flags); `email` lets Auth.js match an existing account;
  //    `guilds` lets the card show the server the owner is active in (read of
  //    `users/@me/guilds`, non-privileged); `guilds.join` lets the user add
  //    THEMSELVES to our own server, which is the only way our bot can see their
  //    live presence (Discord's GUILD_PRESENCES rule). Discord spells both
  //    permissions out on its consent screen, so the grant stays visible/revocable.
  oauthProviders.push(
    Discord({
      // Discord, yetki VE token yanıtına `iss=https://discord.com` ekliyor (RFC 9207).
      // Pakete gömülü Discord tanımında `issuer` alanı yok, bu yüzden @auth/core
      // keşfe çıkmıyor ve `as.issuer` "https://authjs.dev" olarak kalıyor
      // (@auth/core/lib/actions/callback/oauth/callback.js:50); oauth4webapi ise
      // uyuşmazlığı `unexpected "iss"` ile patlatıp callback'i tamamen öldürüyor.
      // `token` ve `userinfo` URL'leri paket tarafından zaten tanımlı olduğundan
      // bu alan SADECE doğrulama karşılaştırması olarak kullanılır; ek bir OIDC
      // keşif isteği tetiklenmez (bu sürümde `wellKnown` yalnızca yazılıyor, hiçbir
      // yerde okunmuyor). Yine de yükseltilen bir next-auth sürümünde bu satır
      // gereksiz kalırsa silinebilir — hata mesajı tam olarak bu cümledir.
      issuer: "https://discord.com",
      authorization: {
        params: { prompt: "consent", scope: "identify email guilds guilds.join" },
      },
    })
  );
}

const credentialsProvider = Credentials({
  name: "Email",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
    // The second factor. Absent for accounts without 2FA; a 6-digit TOTP code or
    // a single-use backup code when they have it. Declared here so Auth.js reads
    // it off the login POST instead of dropping it.
    token: { label: "Authentication code", type: "text" },
  },
  async authorize(credentials) {
    const parsed = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        token: z.string().optional(),
      })
      .safeParse(credentials);
    if (!parsed.success) return null;

    const { email, password, token } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    // Email verification — the hard block, and the only place it exists. Answered
    // exactly like a wrong password (return null), for the same reason the 2FA
    // branch below is: the response must not advertise that the password was right
    // and something else is missing. `loginUser` turns this silent refusal into an
    // explanation before it gets here, and only for a password it has already
    // verified. Accounts that predate the feature carry `verifyEmail = false`, so
    // this branch cannot be reached by them at all.
    if (user.verifyEmail && !user.emailVerified) return null;

    // Second factor — only for accounts that turned it on. A missing or wrong
    // code ends the sign-in exactly like a wrong password (return null), so the
    // response never reveals which of the two steps failed. A backup code is
    // single-use, so it is consumed (its hash removed) the moment it works.
    if (user.twoFactorEnabled) {
      const code = (token ?? "").trim();
      if (!code) return null;
      const totpOk = await verifyTotp(user.twoFactorSecret, code);
      if (!totpOk) {
        const matched = await matchBackupCode(user.twoFactorBackup, code);
        if (matched) {
          await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorBackup: consumeBackupCode(user.twoFactorBackup, matched) },
          });
        } else if (!(await verifyAndConsumeLoginOtp(user.id, code))) {
          // Not a TOTP, a backup code, nor a live emailed code — the sign-in ends
          // exactly like a wrong password, revealing nothing about which step failed.
          return null;
        }
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [credentialsProvider, ...oauthProviders],
  callbacks: {
    ...authConfig.callbacks,
    // Device tracking for the Account page's "Active sessions" list. The session
    // strategy is JWT, so Auth.js never fills its own Session table — this is the
    // substitute. A random `jti` is minted once per sign-in and embedded in the
    // token; only its SHA-256 hash is stored, so a leaked row is not a usable
    // token. `headers()` works here because this runs in the Node route handler
    // (the Edge middleware uses auth.config.ts, which has no jwt callback).
    async jwt({ token, trigger }) {
      if ((trigger === "signIn" || !token.jti) && token.sub) {
        const jti = randomUUID();
        token.jti = jti;
        const h = await headers();
        const userAgent = h.get("user-agent")?.slice(0, 255) ?? null;
        const ip =
          (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip"))?.trim().slice(0, 64) ??
          null;
        await prisma.deviceSession
          .create({
            data: {
              userId: token.sub,
              tokenHash: createHash("sha256").update(jti).digest("hex"),
              userAgent,
              ip,
            },
          })
          .catch(() => {});
      } else if (token.jti) {
        // Refresh lastSeenAt at most once per 5 minutes, marked in the token so a
        // busy profile does not turn every request into a write.
        const now = Date.now();
        const last = token.lastSeen;
        if (typeof last !== "number" || now - last > 5 * 60 * 1000) {
          token.lastSeen = now;
          await prisma.deviceSession
            .updateMany({
              where: { tokenHash: createHash("sha256").update(token.jti).digest("hex") },
              data: { lastSeenAt: new Date(now) },
            })
            .catch(() => {});
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.jti = token.jti;
      }
      return session;
    },
    async signIn({ user, account }) {
      // A Discord grant — whether it came from "login with Discord" or from the
      // dashboard's "Connect Discord" — is the profile's Discord identity. The
      // provider account id IS the snowflake, so storing it here means even an
      // account that only ever logged in through Discord gets the rich card
      // without touching the dashboard. Fire-and-forget: a profile write must
      // never be able to block a sign-in.
      if (account?.provider === "discord" && user.id) {
        const snowflake = String(account.providerAccountId ?? "");
        if (/^[0-9]{15,20}$/.test(snowflake)) {
          const current = await prisma.profile
            .findUnique({
              where: { userId: user.id },
              select: { discordSnowflake: true },
            })
            .catch(() => null);
          // Only write when it actually changed: every re-login would otherwise
          // bump updatedAt and churn the profile cache for nothing.
          if (current?.discordSnowflake !== snowflake) {
            await prisma.profile
              .upsert({
                where: { userId: user.id },
                create: { userId: user.id, discordSnowflake: snowflake },
                update: { discordSnowflake: snowflake },
              })
              .catch(() => {});
          }

          // Keep the stored grant in sync with the one just given. Auth.js writes
          // the Account row only when it LINKS an account, so a re-consent for an
          // existing one updated nothing — harmless while the scope was fixed,
          // wrong now that `guilds.join` lives in it: a user who granted the
          // permission on their second try would stay recorded as not having it,
          // and the dashboard would nag them forever. `undefined` fields mean
          // "leave as is", so a response that carries no refresh token cannot
          // erase the one that works. (For a brand-new link the row does not exist
          // yet and the adapter creates it — the rejected update is why this is
          // caught rather than awaited hard.)
          const freshAccessToken = String(account.access_token ?? "");
          if (freshAccessToken) {
            await prisma.account
              .update({
                where: {
                  provider_providerAccountId: {
                    provider: "discord",
                    providerAccountId: snowflake,
                  },
                },
                data: {
                  access_token: freshAccessToken,
                  refresh_token: account.refresh_token
                    ? String(account.refresh_token)
                    : undefined,
                  token_type: account.token_type ? String(account.token_type) : undefined,
                  scope: String(account.scope ?? "") || undefined,
                  expires_at:
                    typeof account.expires_at === "number"
                      ? Math.floor(account.expires_at)
                      : undefined,
                },
              })
              .catch(() => {});
          }

          // Same reasoning as the write above, one step further: the account is
          // now known to be Discord, so put it in our guild and let the presence
          // worker start seeing it. Never awaited — a slow or refused Discord call
          // must not delay or fail a sign-in — and `maybeJoinOwnGuild` re-checks
          // both the bot configuration and the granted scope before it sends the
          // token anywhere.
          void maybeJoinOwnGuild({
            snowflake,
            accessToken: freshAccessToken,
            scope: String(account.scope ?? ""),
          }).catch(() => {});
        }
      }

      // When signing in via GitHub/Discord OAuth, auto-create a verified social link.
      if (account && account.provider !== "credentials") {
        // The provider vouched for this address — that is what an OAuth login is.
        // Auth.js still creates the user with `emailVerified: null` (it only marks
        // an address verified when it trusts a provider's own claim, which it does
        // not write for a new user), so every OAuth account here reads as
        // "not verified" on the Account page. Google, GitHub and Discord only ever
        // return addresses that are verified on their side, so the stamp is a fact
        // rather than a shortcut. Guarded on `emailVerified: null` so it can never
        // overwrite a date, and fire-and-forget so it can never block a sign-in.
        if (user.email) {
          await prisma.user
            .updateMany({
              where: { id: user.id, emailVerified: null },
              data: { emailVerified: new Date() },
            })
            .catch(() => {});
        }

        const profile = account.profile as Record<string, unknown> | undefined;
        const login = (profile?.login ?? profile?.preferred_username ?? profile?.username) as
          | string
          | undefined;

        const platform =
          account.provider === "github"
            ? "GitHub"
            : account.provider === "discord"
              ? "Discord"
              : null;

        if (platform && user.id) {
          const url =
            account.provider === "github" && login
              ? `https://github.com/${login}`
              : account.provider === "discord"
                ? `https://discord.com/users/${account.providerAccountId}`
                : "";
          if (url) {
            const existing = await prisma.socialLink.findFirst({
              where: { userId: user.id, platform, url },
            });
            if (!existing) {
              await prisma.socialLink
                .create({
                  data: {
                    platform,
                    url,
                    username: login,
                    isVerified: true,
                    userId: user.id,
                  },
                })
                .catch(() => {
                  /* ignore duplicate races */
                });
            }
          }
        }
      }
      return true;
    },
  },
});
