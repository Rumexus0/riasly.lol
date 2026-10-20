import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config. It MUST NOT import Prisma or the adapter,
 * because it is also consumed by `middleware.ts` (Edge runtime).
 * Only session/JWT callbacks and pages live here.
 */
export default {
  trustHost: true,
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
