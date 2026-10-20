import { getTranslations } from "next-intl/server";
import Container from "./ui/Container";
import Section from "./ui/Section";
import Accordion from "./Accordion";
import Reveal from "./motion/Reveal";

export default async function FAQ() {
  const t = await getTranslations("faq");
  const items = t.raw("items") as { question: string; answer: string }[];

  return (
    <Section id="faq" className="border-t border-edge2 bg-panel/40">
      <Container>
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-plumborder">
            {t("eyebrow")}
          </p>
          <Reveal>
            <h2 className="text-gradient mt-3 text-3xl font-bold sm:text-4xl">
              {t("title")}
            </h2>
          </Reveal>
        </div>

        <div className="mx-auto max-w-3xl">
          <Accordion items={items} />
        </div>
      </Container>
    </Section>
  );
}
