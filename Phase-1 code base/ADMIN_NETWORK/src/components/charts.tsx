"use client";

import { useId, useState } from "react";

// Grid lines and empty tracks in the text colour, so they show in both themes.
const faint = (percent: number) => ({ stroke: `color-mix(in oklab, var(--color-cream) ${percent}%, transparent)` });

export const CHART = { gold: "#D6A000", rose: "#E58AA8", sky: "#8FB4E8", amber: "#E8A15C", green: "#6FCF97", lilac: "#B48CE0" };

type Point = [number, number];

// Catmull-Rom to Bezier: smooth curves like the reference dashboard.
function smooth(points: Point[]) {
  if (points.length < 2) return points.length ? `M${points[0]![0]},${points[0]![1]}` : "";
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

type Series = { name: string; values: number[]; color: string; fill?: boolean };

export function LineChart({ series, labels, height = 220, format = (value: number) => String(Math.round(value)), grid = true }: { series: Series[]; labels: string[]; height?: number; format?: (value: number) => string; grid?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const pad = { top: 12, bottom: 24, left: 4, right: 4 };
  const count = Math.max(...series.map((item) => item.values.length), 1);
  const max = Math.max(1, ...series.flatMap((item) => item.values)) * 1.12;
  const x = (at: number) => pad.left + (count === 1 ? (width - pad.left - pad.right) / 2 : (at * (width - pad.left - pad.right)) / (count - 1));
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
  const step = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-auto w-full" style={{ aspectRatio: `${width} / ${height}` }} onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((item, at) => (
            <linearGradient key={item.name} id={`${id}-g${at}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={item.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {grid
          ? [0.25, 0.5, 0.75, 1].map((line) => <line key={line} x1={pad.left} x2={width - pad.right} y1={y(max * line)} y2={y(max * line)} style={faint(6)} strokeDasharray="3 4" />)
          : null}
        {series.map((item, at) => {
          const points = item.values.map((value, index) => [x(index), y(value)] as Point);
          const line = smooth(points);
          return (
            <g key={item.name}>
              {item.fill && points.length ? <path d={`${line} L${points[points.length - 1]![0]},${height - pad.bottom} L${points[0]![0]},${height - pad.bottom} Z`} fill={`url(#${id}-g${at})`} /> : null}
              <path d={line} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} style={faint(25)} vectorEffect="non-scaling-stroke" /> : null}
        {Array.from({ length: count }, (_, at) => (
          <rect key={at} x={x(at) - width / count / 2} y={0} width={width / count} height={height} fill="transparent" onMouseEnter={() => setHover(at)} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] muted">
        {labels.map((text, at) => (at % step === 0 || at === labels.length - 1 ? <span key={at}>{text}</span> : null))}
      </div>
      {hover !== null ? (
        <div className="pointer-events-none absolute top-2 rounded-md border border-line bg-night/95 px-3 py-2 text-[11px] shadow-xl" style={{ left: `clamp(0px, calc(${(x(hover) / width) * 100}% - 70px), calc(100% - 150px))` }}>
          <p className="mb-1 font-semibold">{labels[hover]}</p>
          {series.map((item) => (
            <p key={item.name} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              <span className="muted">{item.name}</span>
              <span className="ml-auto pl-3 tabular-nums">{format(item.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Bars({ values, color = CHART.sky, height = 110, highlight }: { values: number[]; color?: string; height?: number; highlight?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((value, at) => (
        <div key={at} className="flex-1 rounded-t-sm transition-all" title={String(value)} style={{ height: `${Math.max(3, (value / max) * 100)}%`, background: at === values.length - 1 && highlight ? highlight : color, opacity: at === values.length - 1 ? 1 : 0.55 + (0.45 * value) / max }} />
      ))}
    </div>
  );
}

export function Donut({ value, label, color = CHART.gold, size = 150 }: { value: number; label: string; color?: string; size?: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" style={faint(7)} strokeWidth="11" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${circumference * clamped} ${circumference}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] muted">{label}</span>
        <span className="text-2xl font-bold tabular-nums">{Math.round(clamped * 100)}%</span>
      </div>
    </div>
  );
}

export function Progress({ value, color = CHART.sky }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-cream/10">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}
