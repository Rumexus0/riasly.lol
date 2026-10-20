import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Per-login random id embedded in the JWT; its SHA-256 keys DeviceSession. */
      jti?: string;
    } & DefaultSession["user"];
  }

  interface User {
    handle?: string | null;
    plan?: "FREE" | "PREMIUM";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Minted once at sign-in; identifies this browser's DeviceSession row. */
    jti?: string;
    /** Epoch ms of the last DeviceSession.lastSeenAt write (throttle marker). */
    lastSeen?: number;
  }
}
