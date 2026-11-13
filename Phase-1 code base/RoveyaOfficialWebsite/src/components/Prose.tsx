import type { Section } from "@/lib/content";

export function Prose({ kicker, title, intro, sections }: { kicker: string; title: string; intro?: string; sections: Section[] }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="kicker">{kicker}</p>
      <h1 className="display mt-4 text-5xl sm:text-6xl">{title}</h1>
      {intro ? <p className="mt-5 text-lg leading-8 text-cream/70">{intro}</p> : null}
      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold text-gold">{section.title}</h2>
            <div className="mt-3 space-y-4">
              {section.items.map((item, index) => (
                <div key={index}>
                  {item.q ? <p className="font-medium">{item.q}</p> : null}
                  <p className="mt-1 leading-8 text-cream/70">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
