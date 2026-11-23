import type { Metadata } from "next";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { aboutParagraphs, blogPosts, contactCards, officeAddress } from "@/lib/content";

export const metadata: Metadata = { title: "About ROVEYA", description: "ROVEYA, by Roveya Transportation Services Private Limited, sells seats in clean, verified cars between the cities you travel." };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="kicker">About ROVEYA</p>
          <h1 className="display mt-4 text-5xl sm:text-6xl">A better way to travel between cities</h1>
          <div className="mt-8 space-y-5 leading-8 text-cream/70">
            {aboutParagraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-gold/20">
          <Image src="/images/cust-pool-group.jpg" alt="Travellers sharing a ROVEYA car" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
      </div>

      <section id="contact" className="mt-24 scroll-mt-24">
        <p className="kicker">Contact</p>
        <h2 className="display mt-4 text-4xl sm:text-5xl">We are one call away</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {contactCards.map((card) => (
            <div key={card.title} className="card p-6">
              <p className="font-semibold">{card.title}</p>
              <div className="mt-4 space-y-2 text-sm">
                {card.lines.map((line) => (
                    <p key={line.label} className="flex justify-between gap-3">
                    <span className="shrink-0 text-cream/50">{line.label}</span>
                    {line.action === "help" ? (
                      <a href="/help" className="text-gold">
                        Chat with us
                      </a>
                    ) : line.link ? (
                      <a href={line.link} className="truncate text-gold">
                        {line.value}
                      </a>
                    ) : (
                      <span>{line.value}</span>
                    )}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 flex items-start gap-3 text-sm text-cream/60">
          <MapPin size={18} className="mt-0.5 shrink-0 text-gold" /> {officeAddress.join(", ")}
        </p>
      </section>

      {blogPosts.length ? (
        <section className="mt-24">
          <p className="kicker">From the blog</p>
          <h2 className="display mt-4 text-4xl sm:text-5xl">Notes from the road</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {blogPosts.slice(0, 3).map((post) => (
              <article key={post.id} className="card overflow-hidden">
                <div className="relative aspect-[16/10]">
                  <Image src={post.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                </div>
                <div className="p-6">
                  <p className="text-xs text-cream/45">
                    {post.date} · {post.read}
                  </p>
                  <p className="mt-2 text-lg font-semibold">{post.title}</p>
                  <p className="mt-2 text-sm leading-6 text-cream/65">{post.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
