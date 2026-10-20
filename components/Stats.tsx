import { getTranslations } from "next-intl/server";
import Container from "./ui/Container";
import Section from "./ui/Section";
import AnimatedCounter from "./AnimatedCounter";
import Reveal from "./motion/Reveal";
import { getStats } from "@/lib/stats";

export default async function Stats() {
  const t = await getTranslations("stats");
  const stats = await getStats();

  const items = [
    { label: t("labels.profileViews"), value: stats.profileViews },
    { label: t("labels.users"), value: stats.users },
    { label: t("labels.fileUploads"), value: stats.fileUploads },
    { label: t("labels.subscribers"), value: stats.subscribers },
  ];

  return (
    <Section className="relative overflow-hidden border-y border-edge2 bg-panel/40">
      <div className="pointer-events-none absolute inset-0 bg-plumradial" aria-hidden />
      <Container className="relative">
        <div className="mb-10 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-plumborder">
          <span className="h-2 w-2 animate-pulse-glow rounded-full bg-plumborder" />
          {t("live")}
        </div>

        <div className="grid grid-cols-2 gap-4 text-center lg:grid-cols-4 lg:gap-8">
          {items.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="glass rounded-card px-4 py-8 shadow-card">
                <div className="bg-gradient-to-b from-softwhite to-plumborder bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl lg:text-6xl">
                  <AnimatedCounter
                    value={s.value}
                    suffix={s.value > 0 ? "+" : ""}
                  />
                </div>
                <p className="mt-2 text-sm font-medium uppercase tracking-widest text-mutedtext sm:text-base">
                  {s.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
