import { getTranslations } from "next-intl/server";
import Container from "./ui/Container";
import Section from "./ui/Section";
import GlassCard from "./ui/GlassCard";
import Reveal from "./motion/Reveal";

type FeatureItem = { title: string; description: string };

function FeatureIcon({ index }: { index: number }) {
  const common = "h-6 w-6";
  if (index === 0) {
    return (
      <svg
        className={common}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  return (
    <svg
      className={common}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function Features() {
  const t = await getTranslations("features");
  const items = t.raw("items") as FeatureItem[];

  return (
    <Section id="features">
      <Container>
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-plumborder">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-gradient sm:text-4xl">
            {t("title")}
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {items.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <GlassCard hover className="h-full p-7">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-card border border-plumborder/40 bg-gradient-to-b from-plum/40 to-plum/10 text-softwhite shadow-glow">
                  <FeatureIcon index={i} />
                </div>
                <h3 className="text-xl font-bold text-softwhite">{f.title}</h3>
                <p className="mt-3 text-[17px] leading-relaxed text-mutedtext">
                  {f.description}
                </p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
