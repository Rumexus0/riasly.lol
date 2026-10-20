// riasly — robots.txt. Public profile pages (/[username]) and the marketing pages
// are meant to be found; the signed-in dashboard and the one-shot auth/utility
// routes are not, and indexing them would leak URL shapes (a /verify token URL,
// a /redeem code page) into search engines. Kept as code so it ships with the app
// and cannot drift from the real route tree the way a hand-edited public/robots.txt
// would.
import type { MetadataRoute } from "next";

import { appOrigin } from "@/lib/widgets";

export default function robots(): MetadataRoute.Robots {
  const base = appOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api", "/verify", "/recovery", "/redeem"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
