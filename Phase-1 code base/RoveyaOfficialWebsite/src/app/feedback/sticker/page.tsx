import type { Metadata } from "next";
import { Mark } from "@/components/Brand";
import { PrintButton } from "@/components/PrintButton";
import { COMPANY_NAME, DESK_PHONE, SITE_URL } from "@/lib/format";
import { qrFor } from "@/lib/qr";

export const metadata: Metadata = { title: "In-car QR sticker", robots: { index: false, follow: false } };

// A6 sticker fixed in every car. Each car's QR carries its number, so reviews show which car it was.
export default async function StickerPage({ searchParams }: { searchParams: Promise<{ car?: string }> }) {
  const { car } = await searchParams;
  const plate = (car ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const link = `${SITE_URL}/feedback${plate ? `?car=${plate}` : ""}`;
  const qr = await qrFor(link, 520, "H");

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-5 py-10 print:p-0">
      <div className="no-print text-center">
        <p className="kicker">In-car QR scanner</p>
        <p className="mt-2 text-sm text-cream/60">Print on A6 card, laminate it, and fix it to the back of the front seat at eye level.</p>
        <div className="mt-5">
          <PrintButton />
        </div>
      </div>

      <article id="sticker" className="relative flex w-[105mm] flex-col items-center overflow-hidden rounded-[6mm] border border-gold/60 bg-night px-[8mm] pb-[7mm] pt-[8mm] text-center text-cream shadow-2xl [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:rounded-none print:shadow-none" style={{ height: "148mm" }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(107,24,56,0.75),transparent_65%)]" />
        <div className="relative flex items-center gap-[2.5mm]">
          <Mark size={34} />
          <div className="text-left">
            <p className="text-[15px] font-semibold leading-none tracking-[0.32em]">ROVEYA</p>
            <p className="mt-[1.2mm] text-[6.5px] font-medium uppercase tracking-[0.14em] text-gold">Transportation Services Private Limited</p>
          </div>
        </div>

        <p className="relative mt-[7mm] text-[9px] font-semibold uppercase tracking-[0.34em] text-gold">Feedback</p>
        <h1 className="display relative mt-[1.5mm] text-[34px] leading-none">Rate your ride</h1>
        <p className="relative mt-[2.5mm] text-[11px] leading-snug text-cream/75">Scan with your phone camera and tell us how the trip went.</p>

        <div className="relative mt-[5mm] rounded-[4mm] bg-cream p-[3mm] shadow-[0_0_0_1.5px_rgba(214,160,0,0.8)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR code to rate your ROVEYA ride${plate ? ` in car ${plate}` : ""}`} className="h-[46mm] w-[46mm]" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[2mm] bg-cream p-[1mm]">
            <Mark size={30} />
          </span>
        </div>

        <div className="relative mt-[4mm] flex gap-[1.2mm] text-gold" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((star) => (
            <svg key={star} viewBox="0 0 24 24" className="h-[4mm] w-[4mm] fill-current">
              <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
            </svg>
          ))}
        </div>

        <div className="relative mt-auto w-full border-t border-gold/30 pt-[3mm]">
          {plate ? <p className="text-[10px] font-semibold tracking-[0.24em]">CAR {plate}</p> : null}
          <p className="mt-[1mm] text-[8px] text-cream/60">Your review may appear on the ROVEYA website · Help: {DESK_PHONE}</p>
          <p className="mt-[0.8mm] text-[6.5px] text-cream/40">{COMPANY_NAME}</p>
        </div>
      </article>

      <p className="no-print break-all text-center text-xs text-cream/40">QR opens {link}</p>
    </div>
  );
}
