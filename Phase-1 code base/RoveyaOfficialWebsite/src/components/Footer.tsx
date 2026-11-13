import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { COMPANY_NAME, DESK_EMAIL, DESK_PHONE, DESK_TEL, OFFICE_CITY, POPULAR_ROUTES, cityName, todayIso } from "@/lib/format";
import { Logo } from "./Brand";
import { StoreButtons } from "./StoreButtons";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-gold/15 bg-[#0c0308]">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-8">
        <div className="space-y-5">
          <Logo />
          <p className="max-w-sm text-sm leading-7 text-cream/60">Premium intercity travel, one seat at a time. Choose your exact seat in a clean, verified car, follow the journey live, and travel beside women when you prefer.</p>
          <StoreButtons compact />
        </div>
        <div>
          <p className="kicker">Popular routes</p>
          <ul className="mt-5 space-y-3 text-sm text-cream/70">
            {POPULAR_ROUTES.slice(0, 6).map(([from, to]) => (
              <li key={`${from}-${to}`}>
                <Link className="hover:text-gold" href={`/search?from=${from}&to=${to}&date=${todayIso()}`}>
                  {cityName(from)} to {cityName(to)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="kicker">ROVEYA</p>
          <ul className="mt-5 space-y-3 text-sm text-cream/70">
            <li><Link className="hover:text-gold" href="/about">About us</Link></li>
            <li><Link className="hover:text-gold" href="/safety">Safety and Women Zone</Link></li>
            <li><Link className="hover:text-gold" href="/captains">Drive with ROVEYA</Link></li>
            <li><Link className="hover:text-gold" href="/app">Download the app</Link></li>
            <li><Link className="hover:text-gold" href="/terms">Terms and cancellation</Link></li>
            <li><Link className="hover:text-gold" href="/privacy">Privacy policy</Link></li>
          </ul>
        </div>
        <div>
          <p className="kicker">Talk to us</p>
          <ul className="mt-5 space-y-4 text-sm text-cream/70">
            <li className="flex gap-3"><Phone size={16} className="mt-0.5 shrink-0 text-gold" /><a href={DESK_TEL} className="hover:text-gold">{DESK_PHONE} · 5 AM to 11 PM</a></li>
            <li className="flex gap-3"><Mail size={16} className="mt-0.5 shrink-0 text-gold" /><a href={`mailto:${DESK_EMAIL}`} className="hover:text-gold">{DESK_EMAIL.split("@")[0]}<wbr />@{DESK_EMAIL.split("@")[1]}</a></li>
            <li className="flex gap-3"><MapPin size={16} className="mt-0.5 shrink-0 text-gold" />{OFFICE_CITY}</li>
          </ul>
          <Link href="/help" className="btn-ghost mt-6 px-4 py-2.5 text-sm">Chat with the desk</Link>
        </div>
      </div>
      <div className="border-t border-gold/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-cream/40 sm:flex-row sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <p>Payments secured by Razorpay · Safety desk open 24×7</p>
        </div>
      </div>
    </footer>
  );
}
