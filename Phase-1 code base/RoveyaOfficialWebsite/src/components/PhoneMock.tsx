// A drawn phone showing the seat map, so the download section needs no screenshots.
export function PhoneMock() {
  const seat = (label: string, kind: "free" | "booked" | "woman" | "picked") => (
    <div
      className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border text-[9px] ${
        kind === "picked" ? "border-gold bg-gold text-night" : kind === "booked" ? "border-transparent bg-mist text-cream/40" : kind === "woman" ? "border-rose bg-rose/15 text-cream" : "border-cream/30 bg-night text-cream"
      }`}
    >
      <span className="text-[11px] font-semibold">{label}</span>
      <span>{kind === "booked" ? "Booked" : kind === "picked" ? "✓" : "₹579"}</span>
    </div>
  );
  return (
    <div className="relative mx-auto w-[270px] rounded-[2.6rem] border border-gold/40 bg-[#0c0308] p-3 shadow-[0_40px_90px_rgba(107,24,56,0.45)]">
      <div className="absolute left-1/2 top-3 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
      <div className="overflow-hidden rounded-[2.1rem] bg-night px-4 pb-6 pt-10">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Pick your seat</p>
        <p className="mt-1 text-sm font-semibold">Hyderabad → Vijayawada</p>
        <p className="text-[10px] text-cream/50">Tomorrow · 6:30 AM · Ertiga</p>
        <div className="mt-4 rounded-[1.6rem] border border-gold/25 bg-inkwell p-3">
          <div className="mx-auto mb-3 h-5 w-32 rounded-t-[1.2rem] border border-sky-300/20 bg-sky-300/10" />
          <div className="space-y-2">
            <div className="flex justify-between">
              {seat("F1", "picked")}
              <div className="w-12" />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold/20 bg-mist text-[9px] text-gold">You</div>
            </div>
            <div className="flex justify-between">
              {seat("M1", "woman")}
              {seat("M2", "booked")}
              {seat("M3", "free")}
            </div>
            <div className="flex justify-between">
              {seat("B1", "free")}
              <div className="w-12" />
              {seat("B2", "booked")}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-gold px-4 py-3 text-night">
          <span className="text-xs font-semibold">1 seat · F1</span>
          <span className="text-sm font-bold">₹639</span>
        </div>
      </div>
    </div>
  );
}
