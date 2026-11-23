import type { Metadata } from "next";
import { ChevronDown, Mail, Phone, ShieldAlert } from "lucide-react";
import { HelpDesk } from "@/components/HelpDesk";
import { faqGroups } from "@/lib/content";
import { DESK_EMAIL, DESK_PHONE, DESK_TEL } from "@/lib/format";

export const metadata: Metadata = { title: "Help and support", description: "Chat with the ROVEYA desk, call us, or find answers about seats, refunds and safety." };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ pnr?: string }> }) {
  const { pnr } = await searchParams;
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <p className="kicker">Help and support</p>
      <h1 className="display mt-3 text-5xl sm:text-6xl">How can we help you today?</h1>
      <p className="mt-4 max-w-2xl text-cream/65">A real person answers every chat, call and email. Seats, payments, refunds or something on the road, tell us and we will set it right.</p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <a href={DESK_TEL} className="card flex items-center gap-4 p-6 transition hover:border-gold/60">
          <Phone size={24} className="text-gold" />
          <div>
            <p className="font-semibold">Call the desk</p>
            <p className="text-sm text-cream/60">{DESK_PHONE} · 5 AM to 11 PM</p>
          </div>
        </a>
        <a href={`mailto:${DESK_EMAIL}`} className="card flex items-center gap-4 p-6 transition hover:border-gold/60">
          <Mail size={24} className="shrink-0 text-gold" />
          <div className="min-w-0">
            <p className="font-semibold">Email us</p>
            <p className="text-sm text-cream/60">{DESK_EMAIL.split("@")[0]}<wbr />@{DESK_EMAIL.split("@")[1]} · reply within a day</p>
          </div>
        </a>
        <div className="flex items-center gap-4 rounded-3xl border border-danger/30 bg-danger/10 p-6">
          <ShieldAlert size={24} className="text-danger" />
          <div>
            <p className="font-semibold">In danger right now?</p>
            <p className="text-sm text-cream/70">Call 112, or hold SOS on your ticket in the ROVEYA app.</p>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <HelpDesk pnr={pnr} />
      </div>

      <section className="mt-20">
        <h2 className="display text-4xl">Answers to common questions</h2>
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          {faqGroups.map((group) => (
            <div key={group.title}>
              <p className="kicker">{group.title}</p>
              <div className="mt-4 space-y-2">
                {group.items.map((item) => (
                  <details key={item.q ?? item.body} className="group card px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                      {item.q ?? group.title}
                      <ChevronDown size={16} className="shrink-0 text-gold transition group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 text-sm leading-7 text-cream/65">{item.body}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
