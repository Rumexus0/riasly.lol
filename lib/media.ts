// Server-side media resolver. Turns a pasted Tenor/Giphy *share/page* link into
// the direct GIF media URL (read from the page's og:image / twitter:image meta),
// so background-image / avatar <img> actually render. Already-direct media links
// pass through untouched (no network). Our own relative asset paths (/api/media,
// /templates) pass through too — new URL() throws on anything relative, so they
// must be recognised before the parser runs, not after. Guarded against SSRF via
// a host allowlist plus a post-redirect private-host check.

import { isOwnMediaPath, isTemplateAssetPath } from "./media-kind";

// Hosts we are willing to fetch + resolve. Subdomains (www., tr., media., i.) are
// matched via endsWith.
const GIF_SHARE_HOSTS = [
  "tenor.com",
  "giphy.com",
  "giphy.io",
  "imgur.com",
  "redgifs.com",
  "gfycat.com",
];

// Media CDNs we trust as resolved output even without a file extension.
const MEDIA_HOSTS = [
  "media.tenor.com",
  "c.tenor.com",
  "media1.tenor.com",
  "i.giphy.com",
  "media.giphy.com",
  "i.imgur.com",
];

const DIRECT_MEDIA_RE =
  /\.(gif|png|jpe?g|webp|avif|svg|mp4|webm|mov)$/i;

// Max stored URL length — Prisma maps String? to VARCHAR(191) on MySQL.
const MAX_URL_LEN = 190;

function isAllowedShareHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return GIF_SHARE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function isTrustedMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function looksLikeDirectMedia(u: URL): boolean {
  return DIRECT_MEDIA_RE.test(u.pathname);
}

// SSRF guard: reject loopback / private / link-local / ULA / bare hosts.
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
    return true;
  // IPv4 literals
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 127) return true; // this-network + loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local
  }
  // IPv6 loopback / ULA
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return true;
  // Any single-label bare host / non-dotted name is treated as unsafe here.
  if (!host.includes(".") && !/^\d/.test(host)) return true;
  return false;
}

// Small TTL memo so repeated saves of the same share link don't re-fetch.
type CacheEntry = { url: string | null; exp: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

function cacheGet(key: string): CacheEntry | undefined {
  const hit = CACHE.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    CACHE.delete(key);
    return undefined;
  }
  return hit;
}

function cacheSet(key: string, url: string | null): void {
  if (CACHE.size >= CACHE_MAX) {
    // drop oldest insertion
    const first = CACHE.keys().next().value;
    if (first !== undefined) CACHE.delete(first);
  }
  CACHE.set(key, { url, exp: Date.now() + CACHE_TTL_MS });
}

// Read a bounded prefix of the response body (stop early once </head> appears)
// instead of buffering a potentially huge page.
async function readHeadBounded(res: Response, limitBytes = 256 * 1024): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, limitBytes);
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (bytes < limitBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.byteLength ?? 0;
      text += decoder.decode(value, { stream: true });
      if (text.toLowerCase().includes("</head")) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text.slice(0, limitBytes);
}

function extractMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // property/name = "<key>" ... content = "<url>" (attribute order may vary)
    const tagRe = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*?>`,
      "i"
    );
    const tag = html.match(tagRe)?.[0];
    if (tag) {
      const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
      if (content) return content.trim();
    }
    // content first, then property/name
    const revRe = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i"
    );
    const rev = html.match(revRe)?.[1];
    if (rev) return rev.trim();
  }
  return null;
}

function finalize(raw: URL | string): string | null {
  let u: URL;
  try {
    u = typeof raw === "string" ? new URL(raw) : raw;
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (isPrivateHost(u.hostname)) return null;
  const href = u.href;
  if (href.length > MAX_URL_LEN) return null;
  if (looksLikeDirectMedia(u) || isTrustedMediaHost(u.hostname)) return href;
  return null;
}

/**
 * Resolve a pasted URL to a direct media URL suitable for background-image /
 * <img>. Returns null when it cannot be resolved safely (caller shows an error).
 */
export async function resolveMediaUrl(rawInput: string): Promise<string | null> {
  const raw = rawInput.trim();
  if (!raw) return null;

  // Our own uploaded background asset (/api/media/<uuid>.mp4) is already direct
  // media, and new URL() would throw on a relative path — pass it straight through.
  if (isOwnMediaPath(raw)) return raw;

  // Same for a curated gallery asset (/templates/<id>.mp4 | .jpg): it is a local
  // static file, so there is nothing to resolve — only the extension matters, and
  // that is what makes ProfileStage choose <video> over a CSS background.
  if (isTemplateAssetPath(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // 1) Already a direct media link — no network needed.
  if (looksLikeDirectMedia(url)) return finalize(url);

  // 2) Only fetch curated public share hosts (SSRF safety).
  if (!isAllowedShareHost(url.hostname)) return null;

  // 3) Cache hit.
  const key = url.href;
  const cached = cacheGet(key);
  if (cached) return cached.url;

  // 4) Fetch the page HTML and read its image meta tags.
  try {
    const res = await fetch(key, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; riasly-resolver)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      cacheSet(key, null);
      return null;
    }
    // Re-check the final host after redirects (redirect-to-internal guard).
    if (res.url) {
      let finalHost = "";
      try {
        finalHost = new URL(res.url).hostname;
      } catch {
        finalHost = "";
      }
      if (finalHost && isPrivateHost(finalHost)) {
        cacheSet(key, null);
        return null;
      }
    }
    const html = await readHeadBounded(res);
    const candidate = extractMetaContent(html, [
      "og:image",
      "twitter:image",
      "twitter:image:src",
    ]);
    let resolved: string | null = null;
    if (candidate) {
      try {
        resolved = finalize(new URL(candidate, res.url || key));
      } catch {
        resolved = null;
      }
    }
    cacheSet(key, resolved);
    return resolved;
  } catch {
    // timeout / network / abort — treat as unresolvable, but don't poison cache
    return null;
  }
}
