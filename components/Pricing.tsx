import { getTranslations } from "next-intl/server";
import Container from "./ui/Container";
import Section from "./ui/Section";
import Button from "./ui/Button";
import Reveal from "./motion/Reveal";

type PlanItem = {
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  cta: string;
  features: string[];
};

function Check() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 shrink-0 text-plumborder"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default async function Pricing() {
  const t = await getTranslations("pricing");
  const plans = t.raw("plans") as PlanItem[];

  return (
    <Section id="pricing">
      <Container>
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-plumborder">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-gradient sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-3 text-[17px] text-mutedtext">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {plans.map((plan, i) => {
            const highlighted = i === 1;
            return (
              <Reveal key={plan.name} delay={i * 0.1} className="h-full">
                <div
                  className={`relative flex h-full flex-col rounded-card border p-8 ${
                    highlighted
                      ? "glass border-plumborder shadow-glowLg"
                      : "glass"
                  }`}
                >
                  {highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-pill border border-plumborder bg-brandgrad px-4 py-1 text-xs font-semibold uppercase tracking-wider text-white shadow-glow animate-pulse-glow">
                      {t("popular")}
                    </span>
                  )}

                  <h3 className="text-lg font-bold text-softwhite">{plan.name}</h3>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-5xl font-black tracking-tight text-softwhite">
                      {plan.price}
                    </span>
                    <span className="mb-1.5 text-sm text-mutedtext">
                      {plan.priceNote}
                    </span>
                  </div>
                  <p className="mt-3 text-[15px] text-mutedtext">{plan.tagline}</p>

                  <Button
                    href="/signup"
                    variant={highlighted ? "primary" : "secondary"}
                    size="lg"
                    className="mt-7 w-full"
                  >
                    {plan.cta}
                  </Button>

                  <ul className="mt-8 space-y-3">
                    {plan.features.map((feat) => (
                      <li
                        key={feat}
                        className="flex items-start gap-3 text-[15px] text-mutedtext"
                      >
                        <Check />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
