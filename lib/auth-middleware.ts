// riasly — the NextAuth instance middleware runs against. Kept separate from
// auth.config because middleware executes on the Edge runtime and can only do
// token-presence checks; the full session/account logic lives server-side in
// lib/auth-session.ts. Edge-safe NextAuth instance used only for session/token
// checks in middleware.
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

export const { auth } = NextAuth(authConfig);
