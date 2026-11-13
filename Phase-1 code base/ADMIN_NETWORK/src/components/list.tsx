"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { qs, useData } from "@/lib/client";

// Filter + search + page state for a list endpoint. Search waits for typing to pause.
export function useList<T>(base: string, initial: Record<string, string> = {}, poll?: number) {
  const [filters, setFilters] = useState<Record<string, string>>(initial);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  const result = useData<T>(`${base}${qs({ ...filters, q: query, page })}`, poll);
  return {
    ...result,
    q,
    setQ,
    page,
    setPage,
    filters,
    setFilter: (key: string, value: string) => {
      setFilters((current) => ({ ...current, [key]: value }));
      setPage(1);
    },
  };
}

export function Toolbar({ q, setQ, placeholder, children }: { q?: string; setQ?: (value: string) => void; placeholder?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {setQ ? (
        <label className="flex w-full items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 sm:w-72">
          <Search size={14} className="text-cream/40" />
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={placeholder ?? "Search"} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-cream/35" />
        </label>
      ) : null}
      {children}
    </div>
  );
}

export function Chips({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-line bg-panel p-1">
      {options.map(([key, text]) => (
        <button key={key} type="button" onClick={() => onChange(key)} className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${value === key ? "bg-gold text-ink" : "text-cream/70 hover:text-cream"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}
