"use client";

import { Briefcase, Check, CircleUserRound, Disc3 } from "lucide-react";
import type { Seat } from "@/lib/types";

const legend = [
  { label: "Available", box: "border-cream/35 bg-night" },
  { label: "Women only", box: "border-rose bg-rose/10" },
  { label: "Selected", box: "border-gold bg-gold" },
  { label: "Booked (woman)", box: "border-rose/20 bg-rose/20" },
  { label: "Booked", box: "border-mist bg-mist" },
];

// Shown under the map when the car has individual captain seats.
export function CaptainSeatNote() {
  return <p className="text-center text-[11px] text-cream/50">Seats marked Captain are individual chairs with armrests and an aisle beside them.</p>;
}

export function SeatLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-cream/60">
      {legend.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <span className={`h-4 w-4 rounded-[5px] border-[1.5px] ${item.box}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function SeatCell({ seat, on, onPick }: { seat: Seat; on: boolean; onPick: () => void }) {
  const taken = seat.state === "booked" || seat.state === "bookedFemale";
  const women = seat.state === "female" || seat.state === "bookedFemale";
  const look = on
    ? "border-gold bg-gold text-night shadow-[0_10px_30px_rgba(214,160,0,0.35)]"
    : seat.state === "female"
      ? "border-rose bg-rose/10 hover:bg-rose/20"
      : seat.state === "bookedFemale"
        ? "border-rose/20 bg-rose/20 text-rose"
        : seat.state === "booked"
          ? "border-mist bg-mist text-cream/35"
          : "border-cream/35 bg-night hover:border-gold";
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      aria-label={`Seat ${seat.label}${seat.chair ? ", captain seat" : ""}${taken ? ", booked" : `, ₹${seat.price}`}${seat.state === "female" ? ", women only" : ""}`}
      className={`relative flex h-[84px] w-[78px] flex-col items-center justify-center rounded-2xl border-[1.5px] pb-2 transition active:scale-95 ${look} ${taken ? "cursor-help" : ""}`}
    >
      {on ? <Check size={15} className="absolute right-1.5 top-1.5" strokeWidth={3} /> : seat.state === "female" ? <span className="absolute right-2 top-1.5 text-[10px] font-bold text-rose">♀</span> : null}
      {seat.chair ? (
        <>
          <span className={`absolute left-1 top-5 h-9 w-[3px] rounded-full ${on ? "bg-night/35" : "bg-gold/45"}`} />
          <span className={`absolute right-1 top-5 h-9 w-[3px] rounded-full ${on ? "bg-night/35" : "bg-gold/45"}`} />
        </>
      ) : null}
      {taken ? (
        <>
          <CircleUserRound size={22} />
          <span className="mt-1 text-[11px] font-medium">Booked</span>
        </>
      ) : (
        <>
          <span className="text-[15px] font-semibold">₹{seat.price}</span>
          <span className={`mt-0.5 text-[10px] font-medium ${on ? "text-night/70" : women ? "text-rose" : "text-cream/50"}`}>
            {seat.label}
            {seat.chair ? " · Captain" : seat.window ? " · Window" : ""}
          </span>
        </>
      )}
      <span className={`absolute bottom-1.5 h-1 w-10 rounded-full ${on ? "bg-night/45" : women ? "bg-rose" : taken ? "bg-cream/10" : "bg-cream/25"}`} />
    </button>
  );
}

export function SeatMap({ seats, selected, onPick }: { seats: Seat[]; selected: string[]; onPick: (seat: Seat) => void }) {
  const rows = Math.max(0, ...seats.map((seat) => seat.row)) + 1;
  const cell = (row: number, col: number) => seats.find((seat) => seat.row === row && seat.col === col);
  return (
    <div className="relative mx-auto w-[300px] overflow-hidden rounded-[52px] border-[1.5px] border-gold/25 bg-inkwell shadow-[0_40px_90px_rgba(0,0,0,0.5)]">
      <div className="flex flex-col items-center pt-4">
        <div className="h-9 w-52 rounded-b-lg rounded-t-[40px] border border-sky-300/20 bg-sky-300/10" />
        <span className="mt-2 text-[9px] font-semibold tracking-[0.3em] text-cream/35">FRONT</span>
      </div>
      <div className="pointer-events-none absolute left-[-4px] right-[-4px] top-16 flex justify-between">
        <span className="h-6 w-3 rounded bg-plum" />
        <span className="h-6 w-3 rounded bg-plum" />
      </div>
      <div className="space-y-3 px-5 pb-6 pt-4">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex justify-between">
            {[0, 1, 2].map((col) => {
              if (row === 0 && col === 2) {
                return (
                  <div key={col} className="flex h-[84px] w-[78px] flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-cream/10 bg-mist text-cream/40">
                    <Disc3 size={24} />
                    <span className="text-[10px] font-medium">Captain</span>
                  </div>
                );
              }
              const seat = cell(row, col);
              if (!seat) {
                const chairs = seats.some((item) => item.row === row && item.chair);
                return (
                  <div key={col} className="flex h-[84px] w-[78px] items-center justify-center">
                    {chairs ? <span className="-rotate-90 text-[8px] font-semibold tracking-[0.3em] text-cream/30">AISLE</span> : null}
                  </div>
                );
              }
              return <SeatCell key={col} seat={seat} on={selected.includes(seat.id)} onPick={() => onPick(seat)} />;
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-cream/10 bg-mist py-2.5 text-[11px] font-medium text-cream/40">
        <Briefcase size={14} /> Boot · luggage
      </div>
    </div>
  );
}
