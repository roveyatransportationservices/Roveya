// What the desk types off a document photo, "DD/MM/YYYY" or "YYYY-MM-DD", as YYYY-MM-DD for the server.
export function typedDate(value: string) {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const indian = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : indian ? [indian[3], indian[2].padStart(2, "0"), indian[1].padStart(2, "0")] : [];
  if (!year) return null;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) ? null : `${year}-${month}-${day}`;
}

export const expiryText = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
