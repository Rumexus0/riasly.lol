"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Container from "./ui/Container";
import Button from "./ui/Button";
import LanguageSwitcher from "./LanguageSwitcher";
import Logo from "./Logo";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  const navLinks = [
    { label: t("features"), href: "#features" },
    { label: t("pricing"), href: "#pricing" },
    { label: t("faq"), href: "#faq" },
  ];

  return (
    <header className="sticky top-0 z-50 py-3">
      <Container className="flex items-center justify-between gap-4 rounded-pill glass border border-edge2 bg-nearblack/70 py-2.5 backdrop-blur-md shadow-glow">
        <a href="#top" className="shrink-0">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative text-[15px] text-mutedtext transition-colors hover:text-softwhite"
            >
              {l.label}
              <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-plumborder transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button href="/login" variant="secondary" size="md">
            {t("login")}
          </Button>
          <Button href="/signup" variant="primary" size="md">
            {t("signup")}
          </Button>
        </div>

        <button
          type="button"
          aria-label={t("openMenu")}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-card border border-edge2 bg-panel md:hidden"
        >
          <div className="space-y-1.5">
            <span
              className={`block h-0.5 w-5 bg-softwhite transition-transform ${open ? "translate-y-2 rotate-45" : ""}`}
            />
            <span
              className={`block h-0.5 w-5 bg-softwhite transition-opacity ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`block h-0.5 w-5 bg-softwhite transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`}
            />
          </div>
        </button>
      </Container>

      {open && (
        <Container className="md:hidden">
          <div className="mt-2 rounded-card border border-edge2 bg-panel px-5 py-5 backdrop-blur-md">
            <div className="flex flex-col gap-4">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="text-mutedtext hover:text-softwhite"
                >
                  {l.label}
                </a>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Button href="/login" variant="secondary" size="md">
                {t("login")}
              </Button>
              <Button href="/signup" variant="primary" size="md">
                {t("signup")}
              </Button>
            </div>
            <LanguageSwitcher
              label="Language"
              className="mt-4 border-t border-edge2 pt-4"
            />
          </div>
        </Container>
      )}
    </header>
  );
}
