// Public PNR lookup. A wrong code and a wrong phone use the same response.

export const LOOKUP_MISS = "No booking matches that PNR and mobile number.";

export function lookupQuery(pnr: string, phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const code = pnr.trim().toUpperCase();
  if (!/^[6-9]\d{9}$/.test(digits) || !/^[A-Z0-9]{6,12}$/.test(code)) return null;
  return { pnr: code, phone: digits };
}

type Person = { name?: string };
type Seat = { label?: string };
type Stop = { name?: string; time?: string };
type Trip = { fromId?: string; toId?: string; date?: string; departAt?: string; operator?: string; car?: string };
type Quote = { percent?: number; amount?: number; refundPaise?: number; note?: string };

const firstName = (value: string) => {
  const name = value.trim().split(/\s+/)[0] ?? "";
  return name.slice(0, 40) || "Traveller";
};

export function publicLookupView(row: {
  pnr?: string;
  status?: string;
  total?: number;
  refund?: number;
  refundNote?: string;
  refundQuote?: Quote | null;
  travellers?: Person[];
  boarding?: Stop;
  drop?: Stop;
  seats?: Seat[];
  trip?: Trip;
}) {
  const status = String(row.status ?? "");
  const quote = row.refundQuote;
  return {
    pnr: String(row.pnr ?? ""),
    status,
    total: Number(row.total ?? 0),
    ...(status === "Cancelled" ? { refund: Number(row.refund ?? 0) } : {}),
    refundQuote: quote
      ? { percent: quote.percent ?? 0, amount: quote.amount ?? 0, refundPaise: quote.refundPaise ?? 0, note: quote.note ?? "" }
      : null,
    refundNote: row.refundNote ?? "",
    travellers: (row.travellers ?? []).map((person) => ({ name: firstName(String(person.name ?? "")) })),
    boarding: { name: row.boarding?.name ?? "", time: row.boarding?.time ?? "" },
    drop: { name: row.drop?.name ?? "", time: row.drop?.time ?? "" },
    seats: (row.seats ?? []).map((seat) => ({ label: String(seat.label ?? "") })),
    trip: {
      fromId: row.trip?.fromId ?? "",
      toId: row.trip?.toId ?? "",
      date: row.trip?.date ?? "",
      departAt: row.trip?.departAt ?? "",
      operator: firstName(String(row.trip?.operator ?? "Captain")),
      car: String(row.trip?.car ?? ""),
    },
  };
}
