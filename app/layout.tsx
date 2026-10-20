import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import Providers from "@/components/motion/Providers";
import { appOrigin } from "@/lib/widgets";
import "./globals.css";

export const metadata: Metadata = {
  // metadataBase is what makes every share/OG URL absolute. Without it Next emits
  // relative og:image/href values, so a link posted to Discord or X previews blank.
  // appOrigin() is the same canonical-origin fallback the Twitch embed parent uses.
  metadataBase: new URL(appOrigin()),
  title: "riasly — Everything you want, right here.",
  description:
    "Customizable link-in-bio pages and fast, secure file hosting for creators and gamers. Claim your riasly handle today.",
  keywords: ["riasly", "link in bio", "file hosting", "creator", "profile"],
  authors: [{ name: "riasly" }],
  openGraph: {
    title: "riasly — Everything you want, right here.",
    description:
      "Customizable link pages and fast, secure file hosting. Sign up for free.",
    type: "website",
    // The image is produced by app/opengraph-image.tsx; Next wires the absolute URL
    // in via metadataBase, so it is intentionally not hard-coded here.
    siteName: "riasly",
  },
  twitter: {
    card: "summary_large_image",
    title: "riasly — Everything you want, right here.",
    description:
      "Customizable link pages and fast, secure file hosting. Sign up for free.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // suppressHydrationWarning is required, not cosmetic: the script below writes
    // data-motion onto <html> before React hydrates, so the attribute React
    // compares against its own (empty) props is always the visitor's, never the
    // server's. Same escape hatch next-themes uses for the very same pattern.
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* The visitor's motion choice, applied before the first paint so a page
            never animates in the wrong mode (or fails to animate in the right
            one). The key and the values mirror lib/motion-pref.ts, which this
            cannot import: it has to run before the bundle exists. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("riasly.motion");if(p==="force"||p==="calm")document.documentElement.dataset.motion=p;}catch(e){}})();`,
          }}
        />
        <link
          rel="preconnect"
          href="https://api.fontshare.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://assets.mixkit.co"
          crossOrigin="anonymous"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
