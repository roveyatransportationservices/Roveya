const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function nextDays(count: number) {
  const start = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const at = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    return { iso: iso(at), day: days[at.getDay()], date: at.getDate(), month: months[at.getMonth()], year: at.getFullYear(), offset };
  });
}

export function shiftDay(value: string, by: number) {
  const at = parse(value);
  at.setDate(at.getDate() + by);
  return iso(at);
}

export function dayLabel(value: string) {
  const at = parse(value);
  return `${days[at.getDay()]} ${at.getDate()} ${months[at.getMonth()]}`;
}

export function relativeLabel(value: string) {
  const today = nextDays(2);
  if (value === today[0].iso) return "Today";
  if (value === today[1].iso) return "Tomorrow";
  return dayLabel(value);
}

export function isPast(value: string) {
  return value < nextDays(1)[0].iso;
}
