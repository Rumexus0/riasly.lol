"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
// The same predicate the availability API and signup use (imported, not copied):
// a visitor must never be told a handle is free and then rejected on save.
import { HANDLE_RE } from "@/lib/handle";
import Container from "./ui/Container";
import Section from "./ui/Section";
import GlassCard from "./ui/GlassCard";
import Reveal from "./motion/Reveal";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid" | "rate";

export default function ClaimProfile() {
  const t = useTranslations("claim");
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState<Availability>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalized = handle.trim().toLowerCase();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!normalized) {
      setStatus("idle");
      setMessage(null);
      return;
    }
    if (!HANDLE_RE.test(normalized)) {
      setStatus("invalid");
      setMessage(t("invalid"));
      return;
    }

    setStatus("checking");
    setMessage(t("checking"));

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/handle-availability?h=${encodeURIComponent(normalized)}`
        );
        const data = (await res.json()) as {
          available: boolean;
          reason?: string;
        };
        if (res.status === 429 || data.reason === "rate") {
          setStatus("rate");
          setMessage(t("rateLimited"));
        } else if (data.available) {
          setStatus("available");
          setMessage(t("available"));
        } else {
          setStatus("taken");
          setMessage(t("taken"));
        }
      } catch {
        setStatus("idle");
        setMessage(t("errorNetwork"));
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [normalized, t]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!normalized) {
      setStatus("invalid");
      setMessage(t("empty"));
      return;
    }
    if (status === "taken" || status === "invalid") return;
    router.push(`/signup?handle=${encodeURIComponent(normalized)}`);
  }

  return (
    <Section id="claim">
      <Container>
        <Reveal>
        <GlassCard className="mx-auto max-w-3xl p-8 text-center sm:p-12">
          <h2 className="text-gradient text-3xl font-bold sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-mutedtext">
            {t("subtitle")}
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
            noValidate
          >
            <div className="flex flex-1 items-stretch overflow-hidden rounded-field border border-edge bg-input transition-all focus-within:border-plumborder focus-within:shadow-glow">
              <span className="flex items-center border-r border-edge px-4 text-mutedtext select-none">
                {t("prefix")}
              </span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("ariaLabel")}
                spellCheck={false}
                autoComplete="off"
                className="h-14 w-full bg-transparent px-4 text-softwhite placeholder:text-mutedtext/50 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-14 items-center justify-center rounded-pill bg-brandgrad px-7 text-[17px] font-medium text-white shadow-glow transition-all hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98]"
            >
              {t("submit")}
            </button>
          </form>

          <div className="mt-4 min-h-6 text-sm" aria-live="polite">
            {message && (
              <span
                className={
                  status === "available"
                    ? "text-softwhite"
                    : status === "taken" || status === "invalid"
                      ? "text-plumborder"
                      : "text-mutedtext"
                }
              >
                {message}
              </span>
            )}
          </div>
        </GlassCard>
        </Reveal>
      </Container>
    </Section>
  );
}
