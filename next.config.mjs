import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// ---- Security headers (single source of truth for the whole response surface) ----
//
// These were entirely absent before the GitHub-readiness pass. The two read paths
// for user bytes (/api/files, /api/media) already set X-Content-Type-Options
// themselves; putting it on /* too is defense-in-depth for every other response.
//
// The frame/img/media/connect origins below MIRROR lib/widgets.ts (EMBED_ORIGINS,
// IMAGE_HOSTS) and the preconnect hosts in app/layout.tsx. They are duplicated here
// rather than imported because next.config.mjs runs as plain Node ESM before any
// TypeScript is compiled, so it cannot import a .ts module. tests/widgets.test.ts
// pins the lib side of that contract; if you add a widget provider there, add its
// origin here too.
//
// CSP is deliberately REPORT-ONLY. Enforcing a CSP that a real user's widget violates
// silently kills the product's headline feature, and no unit test can prove a live
// YouTube/Spotify/SoundCloud/Twitch embed plays. The plan flips this to
// `Content-Security-Policy` only after each widget type is exercised by hand (see the
// Phase 8 manual checklist), as its own commit.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // The inline boot script in app/layout.tsx (motion preference) and framer-motion's
  // injected styles both need 'unsafe-inline'; a nonce would have to thread through
  // the App Router document, which is out of scope while this is report-only.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  // Own media is served same-origin from /api/media; external embeds are the widget
  // provider origins plus hotlinked gallery artwork.
  "frame-src 'self' https://www.youtube-nocookie.com https://open.spotify.com https://w.soundcloud.com https://player.twitch.tv",
  "connect-src 'self'",
  "font-src 'self' data: https://api.fontshare.com https://cdn.fontshare.com",
  // Background video/audio: own uploads (blob:/same-origin) and the hotlinked Mixkit
  // gallery renders the template picker previews with.
  "media-src 'self' blob: data: https://assets.mixkit.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No bottom-left dev indicator. It is a dev-only affordance and never reaches a
  // visitor, but it does sit on top of every local screenshot and gallery render,
  // so the pill is switched off rather than cropped afterwards.
  devIndicators: false,
  // Nodemailer talks to the network with raw Node APIs and must not be bundled by
  // the server compiler; keep it a real runtime require in the Node server actions.
  serverExternalPackages: ["nodemailer"],
  // Raise the Server Action request-body ceiling (default 1MB) so an admin can
  // post a form whose payload carries a large field. 20MB per the upload flow.
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // Middleware (which guards /dashboard) buffers the request body at 10MB by
    // default; match the 20MB ceiling so the warning stops and nothing is clipped.
    middlewareClientMaxBodySize: "20mb",
  },
  async headers() {
    return [
      {
        // Applied to every route, including the API read paths and static assets.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Same-origin framing only. The profile customizer previews via a
          // same-origin iframe, and nothing legitimate needs a foreign host to
          // frame riasly, so this also blocks UI-redress/clickjacking.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Profiles autoplay an author-chosen background on some accounts; without
          // autoplay=(self) iOS Safari drops it silently. Deny the sensitive
          // capabilities we never use.
          {
            key: "Permissions-Policy",
            value: "autoplay=(self), camera=(), microphone=(), geolocation=()",
          },
          // Report-only until the Phase 8 manual widget pass promotes it (see above).
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
      {
        // HSTS is emitted ONLY when the request actually arrived over TLS. A
        // proxy/CDN that terminates TLS sets x-forwarded-proto: https; matching it
        // here avoids ever sending HSTS over plain http (localhost, or a
        // misconfigured origin), which would pin visitors to a scheme we may not
        // serve. When TLS is terminated at Next itself with no forwarding proxy,
        // add HSTS at that edge instead — this rule intentionally stays silent.
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
