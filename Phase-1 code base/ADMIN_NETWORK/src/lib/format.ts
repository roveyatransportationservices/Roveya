import { cityById } from "./rules";

export const rs = (paise: number | null | undefined, opts: { compact?: boolean } = {}) => {
  const rupees = Number(paise ?? 0) / 100;
  if (opts.compact && Math.abs(rupees) >= 100000) return `₹${(rupees / 100000).toFixed(rupees >= 1000000 ? 1 : 2)}L`;
  if (opts.compact && Math.abs(rupees) >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `${rupees < 0 ? "−" : ""}₹${Math.abs(rupees).toLocaleString("en-IN", { maximumFractionDigits: Math.abs(rupees) < 100 && rupees % 1 ? 2 : 0 })}`;
};

export const num = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("en-IN");
export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;

const IST = "Asia/Kolkata";
export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
export const dateOnly = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" }) : "—");
export const shortDay = (day: string) => new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
export const timeOnly = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit" }) : "—");

export const city = (id?: string | null) => (id ? (cityById(id)?.name ?? id.toUpperCase()) : "—");
export const route = (from?: string, to?: string) => `${city(from)} → ${city(to)}`;

export const ago = (iso?: string | null) => {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export const initials = (name?: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("") || "?";

export const label = (value?: string | null) => (value ? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]!);
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
