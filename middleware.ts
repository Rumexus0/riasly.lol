import { auth } from "@/lib/auth-middleware";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  // "Logged in" here can only ever mean "a session token is present": this runs
  // on the Edge runtime with no Prisma. Whether that account still exists in the
  // database is decided page-side (lib/auth-session.ts), which is what keeps a
  // stale cookie from bouncing /login and /dashboard into each other forever.
  const isLoggedIn = !!req.auth;

  const isProtected =
    nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/redeem");

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("next", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/redeem"],
};
