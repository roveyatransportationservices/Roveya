"use client";

import { useEffect, useState } from "react";

// The verification clock: it starts when the Vado registers and runs for `minutes` (45 by default).
// Green while just started, orange in good time, red in the last stretch and when overdue.
export const TIMER_COLOR = { green: "#6FCF97", orange: "#E8A15C", red: "#E5484D", grey: "#9A8F99" };

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

export function timerState(registeredAt: string, dueAt: string, now: number) {
  const start = Date.parse(registeredAt);
  const end = Date.parse(dueAt);
  const total = Math.max(1, end - start);
  const left = end - now;
  const used = (now - start) / total;
  const tone = left < 0 ? "red" : used < 1 / 3 ? "green" : left > 10 * 60000 ? "orange" : "red";
  return { left, used: Math.min(1, Math.max(0, used)), tone: tone as keyof typeof TIMER_COLOR, overdue: left < 0, label: left < 0 ? "Overdue" : tone === "green" ? "Just started" : tone === "orange" ? "In good time" : "Almost out of time" };
}

const clock = (ms: number) => {
  const total = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function SlaTimer({ registeredAt, dueAt, paused, big, now }: { registeredAt: string; dueAt: string; paused?: boolean; big?: boolean; now: number }) {
  const state = timerState(registeredAt, dueAt, now);
  const color = TIMER_COLOR[state.tone];
  return (
    <div className={big ? "min-w-[180px]" : "min-w-[110px]"}>
      <p className={`font-semibold tabular-nums ${big ? "text-3xl" : "text-[17px]"} ${state.overdue ? "animate-pulse" : ""}`} style={{ color }}>
        {state.overdue ? `+${clock(state.left)}` : clock(state.left)}
      </p>
      <div className={`mt-1 overflow-hidden rounded-full bg-mist ${big ? "h-2" : "h-1.5"}`}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${state.used * 100}%`, background: color }} />
      </div>
      <p className="mt-1 text-[10.5px] font-medium" style={{ color }}>
        {state.label}
        {paused ? <span className="font-normal muted"> · waiting on the Vado</span> : null}
      </p>
    </div>
  );
}
