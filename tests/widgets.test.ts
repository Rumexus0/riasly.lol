// riasly — the widget kernel's origin rules: the contract that lets a user paste a
// link and the app render an embed without ever accepting markup.
//
// Why: lib/widgets.ts is the only thing standing between "I pasted my Twitch
// channel" and an iframe the visitor's browser executes. The SECURITY CONTRACT in
// that file's header says the stored value is always DERIVED and always on a fixed
// origin set; these tests are the executable version of that sentence, including
// the case a future provider branch would most easily get wrong — returning the
// user's own URL instead of the canonical one.
import { afterEach, describe, expect, it } from "vitest";

import {
  WIDGET_TYPES,
  appOrigin,
  isAllowedCardHref,
  isAllowedEmbedSrc,
  resolveEmbed,
  type WidgetType,
} from "@/lib/widgets";

// Mirrors EMBED_ORIGINS in lib/widgets.ts. Kept here as a second copy on purpose:
// if someone widens the production set, this list still asserts what the renderer
// is allowed to embed today, and the mismatch shows up as a red test instead of a
// quietly widened attack surface.
const ALLOWED_IFRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
  "https://player.twitch.tv",
];

const UUID = "9f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b";

function embed(type: WidgetType, input: string, origin = "https://riasly.lol") {
  return resolveEmbed(type, input, origin);
}

describe("resolveEmbed — canonical origin guarantee", () => {
  const inputs: Array<[WidgetType, string]> = [
    ["youtube", "https://youtu.be/dQw4w9WgXcQ"],
    ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ"],
    ["youtube", "https://www.youtube.com/shorts/dQw4w9WgXcQ"],
    ["spotify", "https://open.spotify.com/track/0viRvvEZ5CKJEQrSq3dBoK"],
    ["soundcloud", "https://soundcloud.com/artist/track-slug"],
    ["twitch", "https://www.twitch.tv/somechannel"],
  ];

  for (const [type, input] of inputs) {
    it(`rewrites ${type} "${input}" onto an allowlisted origin`, () => {
      const res = embed(type, input);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.kind).toBe("iframe");
      const { origin } = new URL(res.embedUrl);
      expect(ALLOWED_IFRAME_ORIGINS).toContain(origin);
    });
  }

  it("never hands back the input itself for an iframe", () => {
    // The whole point of the parser: a row is a derived value, so a tampered or
    // stale DB entry cannot simply contain whatever a user typed.
    for (const [type, input] of inputs) {
      const res = embed(type, input);
      if (res.ok) expect(res.embedUrl).not.toBe(input.trim());
    }
  });

  it("keeps every produced URL inside the VARCHAR(190) column", () => {
    for (const type of WIDGET_TYPES) {
      const res = embed(type, "https://example.com/a/b");
      if (res.ok) expect(res.embedUrl.length).toBeLessThanOrEqual(190);
    }
  });
});

describe("resolveEmbed — rejections", () => {
  it("refuses scheme attacks and non-https sources", () => {
    for (const input of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      for (const type of ["youtube", "image", "link"] as WidgetType[]) {
        expect(embed(type, input).ok, `${type} <- ${input}`).toBe(false);
      }
    }
    // Scheme handling differs by branch, and each outcome is the safe one:
    //  - youtube rebuilds a canonical https nocookie URL from the video id, so an
    //    http input is harmless (the STORED value is always https) -> accepted.
    const ytInsecure = embed("youtube", "http://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(ytInsecure.ok).toBe(true);
    if (ytInsecure.ok) {
      expect(ytInsecure.kind).toBe("iframe");
      expect(ytInsecure.embedUrl.startsWith("https://")).toBe(true);
    }
    //  - image passes the host through to an <img src>, so a non-https URL is refused.
    expect(embed("image", "http://i.imgur.com/x.png").ok).toBe(false);
    //  - the card branch is the deliberate exception: an <a target="_blank"> to http is
    //    the user's own link and there is no embed origin to protect there.
    expect(embed("link", "http://example.com").ok).toBe(true);
  });

  it("refuses an off-allowlist host that looks like a provider", () => {
    const cases: Array<[WidgetType, string]> = [
      ["youtube", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"],
      ["youtube", "https://evil.test/?v=dQw4w9WgXcQ"],
      ["spotify", "https://evil.test/track/0viRvvEZ5CKJEQrSq3dBoK"],
      ["soundcloud", "https://evil.test/artist/track"],
      ["twitch", "https://evil.test/somechannel"],
      ["image", "https://evil.test/x.png"],
    ];
    for (const [type, input] of cases) {
      expect(embed(type, input).ok, `${type} <- ${input}`).toBe(false);
    }
  });

  it("refuses malformed ids rather than truncating them", () => {
    expect(embed("youtube", "https://youtu.be/short").ok).toBe(false);
    expect(embed("youtube", "https://youtu.be/").ok).toBe(false);
    expect(embed("spotify", "https://open.spotify.com/track/tooshort").ok).toBe(false);
    expect(embed("soundcloud", "https://soundcloud.com/justartist").ok).toBe(false);
    expect(embed("soundcloud", "https://soundcloud.com/a/b/c").ok).toBe(false);
    expect(embed("twitch", "https://www.twitch.tv/").ok).toBe(false);
    expect(embed("twitch", "https://www.twitch.tv/bad channel").ok).toBe(false);
  });

  it("caps the input length before parsing anything", () => {
    const long = `https://youtu.be/${"a".repeat(300)}`;
    expect(embed("youtube", long).ok).toBe(false);
    expect(embed("link", "https://x.test/".padEnd(400, "a")).ok).toBe(false);
  });

  it("rejects an unknown widget type instead of defaulting to something", () => {
    expect(
      resolveEmbed("not-a-type" as WidgetType, "https://youtu.be/dQw4w9WgXcQ", appOrigin())
        .ok
    ).toBe(false);
  });
});

describe("twitch parent", () => {
  // player.twitch.tv refuses to load unless `parent` matches the embedding site's
  // hostname, so this is both a functional rule (the widget works) and a trust rule
  // (the value comes from OUR configuration, never from the pasted link).
  it("takes the parent from the deployment origin, not from the input", () => {
    const res = embed("twitch", "https://www.twitch.tv/chan?parent=evil.test", "https://riasly.lol");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(new URL(res.embedUrl).searchParams.get("parent")).toBe("riasly.lol");
  });

  it("falls back to localhost when no origin is configured", () => {
    const res = embed("twitch", "https://twitch.tv/chan", "not a url");
    if (!res.ok) throw new Error("expected the twitch resolve to pass");
    expect(new URL(res.embedUrl).searchParams.get("parent")).toBe("localhost");
  });

  it("carries a port through untouched", () => {
    const res = embed("twitch", "https://twitch.tv/chan", "http://localhost:3000");
    if (!res.ok) throw new Error("expected the twitch resolve to pass");
    expect(new URL(res.embedUrl).searchParams.get("parent")).toBe("localhost");
  });
});

describe("appOrigin", () => {
  const saved = {
    site: process.env.NEXT_PUBLIC_SITE_URL,
    app: process.env.NEXT_PUBLIC_APP_URL,
  };
  afterEach(() => {
    if (saved.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved.site;
    if (saved.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = saved.app;
  });

  it("prefers the canonical public origin and trims a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riasly.lol/";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(appOrigin()).toBe("https://riasly.lol");
  });

  it("falls back to the app url, then to localhost", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(appOrigin()).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_APP_URL = "not-an-origin";
    expect(appOrigin()).toBe("http://localhost:3000");
  });
});

describe("isAllowedEmbedSrc — the renderer's second check", () => {
  it("accepts the allowlisted providers and own uploads", () => {
    for (const src of [
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://open.spotify.com/embed/track/0viRvvEZ5CKJEQrSq3dBoK",
      "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb",
      "https://player.twitch.tv/?channel=chan&parent=riasly.lol",
      "https://i.imgur.com/x.png",
      `/api/media/${UUID}.gif`, // own upload: same-origin, no host check needed
    ]) {
      expect(isAllowedEmbedSrc(src), src).toBe(true);
    }
  });

  it("rejects anything else, including a plain http provider", () => {
    for (const src of [
      "",
      "https://evil.test/embed",
      "http://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://youtube-nocookie.com.evil.test/x",
      "javascript:alert(1)",
      `/api/media/${UUID}`, // no extension is not our asset namespace
      "/uploads/whatever.gif", // the retired web-root location
    ]) {
      expect(isAllowedEmbedSrc(src), src).toBe(false);
    }
  });
});

describe("isAllowedCardHref", () => {
  // A card is an <a target="_blank">, so the threat is a scheme, not an origin:
  // any http(s) host is legitimate here and everything else is not.
  it("accepts both schemes a real link uses", () => {
    expect(isAllowedCardHref("https://discord.gg/riasly")).toBe(true);
    expect(isAllowedCardHref("http://example.test")).toBe(true);
  });

  it("refuses the executable and opaque schemes", () => {
    for (const href of [
      "",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///C:/windows",
      "not even a url",
    ]) {
      expect(isAllowedCardHref(href), href).toBe(false);
    }
  });
});
