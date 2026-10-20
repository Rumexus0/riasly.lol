// riasly — branded social/OG card, generated at the edge on demand. Replacing a
// static asset with a route means every deployment (and future locale/plan
// variants) shares one source of truth for the share preview. absolute URLs come
// from metadataBase in app/layout.tsx; Next wires this in automatically because of
// the file name. Kept intentionally dependency-free: Satori (which ImageResponse
// compiles to) supports only a CSS subset, so colours are solid and the mark is an
// inline SVG rather than the tailwind gradient utility class used in the app.
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "riasly — Everything you want, right here.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          backgroundColor: "#0A0A0A",
          // A thin brand gradient rail stands in for the app's brandgrad without
          // relying on background-clip, which Satori does not implement.
          borderLeft: "16px solid #8B5CF6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <svg width="72" height="72" viewBox="0 0 24 24">
            <path d="M7 3h10l4 6-9 12L3 9l4-6z" fill="#8B5CF6" />
            <path d="M7 3h10l-2.2 6H9.2L7 3z" fill="#D946EF" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#ffffff" }}>
            riasly
          </div>
        </div>
        <div
          style={{
            marginTop: "44px",
            fontSize: 46,
            fontWeight: 600,
            color: "#e5e7eb",
            lineHeight: 1.2,
          }}
        >
          Everything you want, right here.
        </div>
        <div style={{ marginTop: "20px", fontSize: 28, color: "#22D3EE" }}>
          Link pages · file hosting · profile widgets · for creators and gamers
        </div>
      </div>
    ),
    { ...size }
  );
}
