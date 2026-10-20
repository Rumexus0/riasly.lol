"use client";

import { useTranslations } from "next-intl";
import Container from "./ui/Container";
import LanguageSwitcher from "./LanguageSwitcher";
import Logo from "./Logo";

export default function Footer() {
  const t = useTranslations("footer");

  const columns = [
    {
      title: t("product"),
      links: [
        { label: t("links.signup"), href: "/signup" },
        { label: t("links.login"), href: "/login" },
        { label: t("links.pricing"), href: "/#pricing" },
        { label: t("links.redeem"), href: "/redeem" },
      ],
    },
    {
      title: t("resources"),
      links: [
        { label: t("links.help"), href: "/#faq" },
        { label: t("links.changelog"), href: "/changelog" },
        { label: t("links.leaderboard"), href: "/leaderboard" },
        { label: t("links.status"), href: "/status" },
        { label: t("links.recovery"), href: "/recovery" },
      ],
    },
  ];

  return (
    <footer className="border-t border-edge2 bg-nearblack">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <a href="#top" className="inline-flex">
              <Logo />
            </a>
            <p className="mt-4 max-w-xs text-[15px] text-mutedtext">{t("blurb")}</p>
            <LanguageSwitcher label={t("language")} className="mt-6" />
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-softwhite">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[15px] text-mutedtext transition-colors hover:text-softwhite"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-edge2 pt-6 text-sm text-mutedtext sm:flex-row">
          <span>{t("rights", { year: new Date().getFullYear() })}</span>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-softwhite">
              {t("terms")}
            </a>
            <a href="#" className="hover:text-softwhite">
              {t("privacy")}
            </a>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-plumborder" />
              {t("statusOnline")}
            </span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
