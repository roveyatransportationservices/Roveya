"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, MapPin, Quote, Star } from "lucide-react";
import type { Testimonial } from "@/lib/content";

const INTERVAL = 5000;

// A row of story cards: three in view on desktop, one and a peek on phones. Swipe works natively.
export function Testimonials({ items }: { items: Testimonial[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [perView, setPerView] = useState(1);

  const pages = Math.max(1, items.length - perView + 1);

  const go = useCallback(
    (next: number) => {
      const row = track.current;
      if (!row) return;
      const target = ((next % pages) + pages) % pages;
      const cards = [...row.children] as HTMLElement[];
      row.scrollTo({ left: cards[target] ? cards[target].offsetLeft - cards[0].offsetLeft : 0, behavior: "smooth" });
      setIndex(target);
    },
    [pages],
  );

  useEffect(() => {
    const measure = () => setPerView(window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (paused || pages < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => go(index + 1), INTERVAL);
    return () => clearTimeout(timer);
  }, [index, paused, pages, go]);

  const onScroll = () => {
    const row = track.current;
    if (!row) return;
    const cards = [...row.children] as HTMLElement[];
    const gap = (card: HTMLElement) => Math.abs(card.offsetLeft - cards[0].offsetLeft - row.scrollLeft);
    let nearest = 0;
    cards.forEach((card, at) => {
      if (gap(card) < gap(cards[nearest])) nearest = at;
    });
    setIndex(Math.min(nearest, pages - 1));
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="What travellers say"
    >
      <div ref={track} onScroll={onScroll} className="no-scrollbar relative -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-5 overflow-x-auto px-5 pb-2 lg:mx-0 lg:scroll-px-0 lg:px-0">
        {items.map((item, at) => (
          <article key={`${item.name}-${at}`} className="card group flex w-[82%] shrink-0 snap-start flex-col overflow-hidden sm:w-[calc(50%-10px)] lg:w-[calc((100%-40px)/3)]">
            <div className="relative h-44 overflow-hidden">
              <Image src={item.image} alt={item.alt} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 85vw" className="object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-inkwell/60 via-transparent to-transparent" />
              <span className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-night/75 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                <MapPin size={12} className="text-gold" /> {item.route}
              </span>
            </div>
            <div className="relative flex flex-1 flex-col px-6 pb-6 pt-5">
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5 text-gold">
                  {Array.from({ length: item.rating }, (_, star) => (
                    <Star key={star} size={14} fill="currentColor" />
                  ))}
                </div>
                <Quote size={22} className="text-gold/35" />
              </div>
              <blockquote className="mt-3 flex-1 text-[15px] leading-7 text-cream/80">&ldquo;{item.quote}&rdquo;</blockquote>
              <div className="mt-5 flex items-end justify-between gap-3 border-t border-gold/10 pt-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="truncate text-xs text-cream/50">{item.role}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-gold/10 px-2 py-1 text-[11px] font-medium text-gold">{item.seat}</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {Array.from({ length: pages }, (_, at) => (
            <button key={at} type="button" onClick={() => go(at)} aria-label={`Show stories from ${at + 1}`} aria-current={at === index ? "true" : undefined} className={`h-1.5 rounded-full transition-all ${at === index ? "w-8 bg-gold" : "w-1.5 bg-cream/25 hover:bg-cream/50"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(index - 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 transition hover:border-gold hover:bg-gold/10" aria-label="Previous stories">
            <ChevronLeft size={17} />
          </button>
          <button type="button" onClick={() => go(index + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 transition hover:border-gold hover:bg-gold/10" aria-label="Next stories">
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
