import Image from "next/image";

// A slow, endless photo reel. The list renders twice so the loop has no seam.
export function HappyStrip({ items }: { items: { image: string; caption: string }[] }) {
  return (
    <div className="marquee group relative overflow-hidden py-2" aria-label="Happy ROVEYA travellers">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-night to-transparent sm:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-night to-transparent sm:w-32" />
      <div className="marquee-track flex w-max gap-5 group-hover:[animation-play-state:paused]">
        {[...items, ...items].map((item, at) => (
          <figure key={at} aria-hidden={at >= items.length} className={`relative h-44 w-60 shrink-0 overflow-hidden rounded-2xl border border-gold/15 sm:h-48 sm:w-64 ${at % 2 ? "mt-4" : ""}`}>
            <Image src={item.image} alt={at < items.length ? item.caption : ""} fill sizes="256px" className="object-cover transition duration-700 hover:scale-105" />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/90 to-transparent px-5 pb-4 pt-10 text-sm font-medium">{item.caption}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
