import Link from "next/link";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  const inner = (
    <span className="inline-flex items-center gap-2.5">
      <svg width={compact ? 34 : 40} height={compact ? 34 : 40} viewBox="0 0 40 40" aria-hidden="true">
        <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="none" stroke="#D6A000" strokeWidth="1.2" />
        <path
          d="M11 28V12h9.2c4.1 0 6.8 2.4 6.8 5.9 0 2.5-1.4 4.5-3.7 5.4L28.8 28h-4.3l-5.1-8.4H15.2V28H11Zm4.2-11.7h5c1.9 0 3.1-1.1 3.1-2.6S22.1 11.1 20.2 11.1h-5v5.2Z"
          fill="#F6F1DC"
        />
        <path d="M8 32.5h24" stroke="#D6A000" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="leading-none">
        <span className="block font-semibold tracking-[0.28em] text-[#F6F1DC]" style={{ fontSize: compact ? 15 : 17 }}>
          ROVEYA
        </span>
        <span className="mt-1 block max-w-[8.5rem] text-[9px] uppercase leading-snug tracking-[0.12em] text-[#D6A000]">Premium taxipool and travel</span>
      </span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex" aria-label="ROVEYA desk">
      {inner}
    </Link>
  );
}
