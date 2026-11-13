import Link from "next/link";

// The one ROVEYA mark, shared with the apps, admin panel and print: Phase-1 code base/brand/roveya-mark.svg
const R = "M13 9H16.6V26H13Z M13 9H20.5A5.5 5.5 0 0 1 20.5 20H13Z M16.6 12.6V16.4H20.5A1.9 1.9 0 0 0 20.5 12.6Z M19 18H23L27.4 26H23.2Z";

export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="shrink-0" aria-hidden="true">
      <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="#12060D" stroke="#E0B23A" strokeWidth="1.2" />
      <path fill="#F6F1DC" d={R} />
      <path d="M13 31H27.4" stroke="#E0B23A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="ROVEYA home">
      <Mark size={40} />
      <span>
        <span className="block text-[17px] font-semibold tracking-[0.32em]">ROVEYA</span>
        <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.16em] text-gold-bright sm:text-[8.5px]">Transportation Services Private Limited</span>
      </span>
    </Link>
  );
}
