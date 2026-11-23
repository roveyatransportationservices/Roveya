"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, MessageSquareText, Search, Star, ThumbsDown, UserRound } from "lucide-react";
import { Chips } from "@/components/list";
import { PageHead } from "@/components/Shell";
import { Badge, Empty, Failure, Loading, Panel, Stat } from "@/components/ui";
import { useData } from "@/lib/client";
import { ago, num, when } from "@/lib/format";

type Party = { id: string; name: string; phone: string | null; code?: string | null } | null;
type Entry = {
  id: string;
  at: string;
  stars: number;
  tags: string[];
  note: string | null;
  ref: string | null;
  route: string | null;
  rider: Party;
  vado: Party;
  source?: string;
  published?: boolean;
  executive?: { id: string; name: string } | null;
  ticket?: { id: string; code: string; topic: string; status: string } | null;
};
type Summary = { count: number; average: number | null; distribution: { stars: number; count: number }[]; low: number; withNote: number; topTags: { tag: string; count: number }[] };
type Data = { title: string; summary: Summary; entries: Entry[]; executives?: { id: string; name: string; count: number; average: number; low: number }[] };

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="flex gap-0.5 text-gold" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={size} className={star <= Math.round(value) ? "fill-current" : "opacity-25"} />
      ))}
    </span>
  );
}

const LEAD = {
  riders: "What passengers said about their ride and their Vado, newest first.",
  vado: "What Vado said about the riders they drove, newest first.",
  support: "How riders and Vado rated the help they got from the ROVEYA desk. Each rating is credited to the executive who last replied or closed the request.",
};

// One Reviews and Ratings page: riders or Vado for a service, or support feedback from riders or Vado.
export function RatingsPage({ side, keyName }: { side: "riders" | "vado" | "support"; keyName: string }) {
  const [days, setDays] = useState("30");
  const [stars, setStars] = useState("");
  const [q, setQ] = useState("");
  const params = new URLSearchParams(Object.entries({ days, stars, q }).filter(([, value]) => value));
  const { data, error, loading, reload } = useData<Data>(`/ratings/${side}/${keyName}?${params.toString()}`, 60000);
  if (error) return <Failure text={error} retry={reload} />;
  const s = data?.summary;
  const carpoolRiders = side === "riders" && keyName === "carpool";

  return (
    <>
      <PageHead
        title={data?.title ?? "Reviews and Ratings"}
        sub={LEAD[side]}
        actions={
          <>
            <Chips
              value={days}
              onChange={setDays}
              options={[
                ["7", "7 days"],
                ["30", "30 days"],
                ["90", "90 days"],
                ["", "All time"],
              ]}
            />
            {carpoolRiders ? (
              <Link href="/desk/ratings/website" className="btn btn-gold">
                <Globe size={14} /> Website reviews
              </Link>
            ) : null}
          </>
        }
      />
      {loading || !data || !s ? (
        <Loading rows={8} />
      ) : (
        <>
          <div className="mb-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <Panel>
              <div className="flex flex-wrap items-center gap-8">
                <div>
                  <p className="text-xs muted">Average rating</p>
                  <p className="mt-1 text-4xl font-semibold tabular-nums">{s.average ?? "—"}</p>
                  <div className="mt-1.5">
                    <Stars value={s.average ?? 0} size={15} />
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-3 gap-4">
                  <Stat label="Ratings" value={num(s.count)} />
                  <Stat label="Low (1–2 ★)" value={num(s.low)} tone={s.low ? "text-danger" : "text-cream"} sub={s.count ? `${Math.round((s.low / s.count) * 100)}% of all` : undefined} />
                  <Stat label="With a comment" value={num(s.withNote)} />
                </div>
              </div>
              {s.topTags.length ? (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {s.topTags.map((item) => (
                    <span key={item.tag} className="rounded-full border border-line px-2.5 py-1 text-[11px]">
                      {item.tag} <span className="muted">· {item.count}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </Panel>
            <Panel title="Stars">
              <div className="space-y-2">
                {s.distribution.map((row) => {
                  const share = s.count ? (row.count / s.count) * 100 : 0;
                  return (
                    <button key={row.stars} type="button" onClick={() => setStars(stars === String(row.stars) ? "" : String(row.stars))} className={`flex w-full items-center gap-3 rounded px-1 py-0.5 text-left text-[12px] transition hover:bg-mist/50 ${stars === String(row.stars) ? "bg-mist" : ""}`}>
                      <span className="w-8 tabular-nums">{row.stars} ★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-mist">
                        <span className={`block h-2 rounded-full ${row.stars >= 4 ? "bg-success" : row.stars === 3 ? "bg-amber" : "bg-danger"}`} style={{ width: `${share}%` }} />
                      </span>
                      <span className="w-10 text-right tabular-nums muted">{row.count}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] muted">Tap a row to show only those ratings.</p>
            </Panel>
          </div>

          {data.executives ? (
            <Panel title="By support executive" pad={false} className="mb-5">
              {data.executives.length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Executive</th>
                      <th>Ratings</th>
                      <th>Average</th>
                      <th>Low (1–2 ★)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.executives.map((row) => (
                      <tr key={row.id}>
                        <td className="font-semibold">{row.name}</td>
                        <td className="tabular-nums">{row.count}</td>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums">{row.average}</span> <Stars value={row.average} size={11} />
                          </span>
                        </td>
                        <td className={row.low ? "text-danger" : "muted"}>{row.low}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <Empty text="No rated requests in this period yet." />
                </div>
              )}
            </Panel>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Chips
              value={stars}
              onChange={setStars}
              options={[
                ["", "All stars"],
                ["5", "5 ★"],
                ["4", "4 ★"],
                ["3", "3 ★"],
                ["2", "2 ★"],
                ["1", "1 ★"],
              ]}
            />
            <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-md border border-line bg-panel px-3">
              <Search size={14} className="muted" />
              <input className="w-full bg-transparent py-2 text-sm outline-none" value={q} onChange={(event) => setQ(event.target.value)} placeholder={side === "support" ? "Search name, phone, executive, ticket or words" : "Search name, phone, Vado code, trip, PNR or words"} />
            </label>
          </div>

          <Panel pad={false}>
            {data.entries.length ? (
              <ul className="divide-y divide-line">
                {data.entries.map((entry) => (
                  <li key={entry.id} className={`grid gap-3 border-l-[3px] px-5 py-4 text-[13px] md:grid-cols-[150px_1fr_1.2fr] ${entry.stars <= 2 ? "border-danger" : entry.stars === 3 ? "border-amber" : "border-transparent"}`}>
                    <div>
                      <Stars value={entry.stars} />
                      <p className="mt-1 text-[11px] muted" title={when(entry.at)}>
                        {ago(entry.at)}
                      </p>
                      {entry.stars <= 2 ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
                          <ThumbsDown size={11} /> Needs a look
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0 space-y-1">
                      {entry.rider ? <Person label="Rider" party={entry.rider} /> : null}
                      {entry.vado ? <Person label="Vado" party={entry.vado} /> : null}
                      {entry.executive ? (
                        <p className="text-[12px]">
                          <span className="muted">Helped by </span>
                          <span className="font-semibold text-gold">{entry.executive.name}</span>
                        </p>
                      ) : side === "support" ? (
                        <p className="text-[12px] muted">No executive on record</p>
                      ) : null}
                      <p className="truncate text-[11px] muted">
                        {[entry.ref, entry.route].filter(Boolean).join(" · ")}
                        {entry.ticket ? ` · ${entry.ticket.status}` : ""}
                      </p>
                    </div>
                    <div className="min-w-0">
                      {entry.note ? (
                        <p className="flex gap-2 leading-6 text-cream/90">
                          <MessageSquareText size={14} className="mt-1 shrink-0 text-gold" />
                          <span>&ldquo;{entry.note}&rdquo;</span>
                        </p>
                      ) : (
                        <p className="text-[12px] muted">No comment, stars only.</p>
                      )}
                      {entry.tags.length || entry.published !== undefined ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {entry.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-mist px-2 py-0.5 text-[10.5px]">
                              {tag}
                            </span>
                          ))}
                          {entry.published !== undefined ? <Badge value={entry.published ? "active" : "pending"}>{entry.published ? "On the website" : "Not on the website"}</Badge> : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <Empty text={s.count ? "No ratings match these filters." : side === "support" ? "No feedback yet. Riders and Vado can rate the desk once a request is resolved." : "No ratings in this period yet."} />
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

function Person({ label, party }: { label: string; party: NonNullable<Party> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
      <UserRound size={12} className="text-cream/50" />
      <span className="muted">{label}</span>
      <span className="font-semibold">{party.name}</span>
      {party.code ? <span className="text-[11px] muted">{party.code}</span> : null}
      {party.phone ? (
        <a className="text-[11px] text-gold" href={`tel:+91${party.phone}`}>
          {party.phone}
        </a>
      ) : null}
    </p>
  );
}
