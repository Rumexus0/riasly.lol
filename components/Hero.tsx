import { getTranslations } from "next-intl/server";
import Container from "./ui/Container";
import Button from "./ui/Button";
import Reveal from "./motion/Reveal";
import DashboardMockup from "./mockups/DashboardMockup";
import ProfileMockup from "./mockups/ProfileMockup";

export default async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section id="top" className="relative overflow-hidden">
      {/* ambient plum glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-10%] -z-10 mx-auto h-[520px] max-w-4xl rounded-full bg-plum/20 blur-[120px] animate-pulse-glow"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[6%] top-40 -z-10 h-64 w-64 rounded-full bg-plumborder/20 blur-[100px] animate-float"
      />

      <Container className="pt-16 pb-12 text-center sm:pt-24 lg:pt-28">
        <Reveal>
          <a
            href="#pricing"
            className="glass group mx-auto mb-8 inline-flex items-center gap-2 rounded-pill px-4 py-1.5 text-sm text-mutedtext transition-colors hover:border-plumborder hover:text-softwhite"
          >
            <span className="h-2 w-2 rounded-full bg-plumborder animate-pulse-glow" />
            {t("promo")}
            <span aria-hidden className="text-plumborder transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </a>
        </Reveal>

        <Reveal delay={0.05}>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-gradient sm:text-6xl lg:text-7xl">
            {t("titleLine1")}
            <br className="hidden sm:block" /> {t("titleLine2")}
          </h1>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-mutedtext sm:text-xl">
            {t("subtitle")}
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/signup" variant="primary" size="lg">
              {t("signUpFree")}
            </Button>
            <Button href="#pricing" variant="secondary" size="lg">
              {t("viewPricing")}
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="relative mx-auto mt-14 flex max-w-4xl flex-col items-center justify-center gap-6 sm:mt-20 sm:flex-row sm:gap-0 [perspective:1600px]">
            <div className="z-10 w-full max-w-md animate-float [animation-duration:9s] sm:-mr-10 sm:max-w-lg sm:-rotate-6 sm:translate-y-3">
              <DashboardMockup label={t("dashboardPreview")} />
            </div>
            <div className="z-20 mx-auto w-full max-w-xs animate-float [animation-delay:1.5s] [animation-duration:7s] sm:rotate-6">
              <ProfileMockup label={t("profilePreview")} />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
