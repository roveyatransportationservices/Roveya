"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Ticket, User, X } from "lucide-react";
import { useAuth } from "./Auth";
import { Logo } from "./Brand";

const links = [
  { href: "/", label: "Home", match: ["/"] },
  { href: "/book", label: "Book seats", match: ["/book", "/search", "/trip"] },
  { href: "/bookings", label: "My bookings", match: ["/bookings", "/booking"] },
  { href: "/safety", label: "Safety", match: ["/safety"] },
  { href: "/captains", label: "Drive with us", match: ["/captains"] },
  { href: "/help", label: "Help", match: ["/help"] },
];

const isActive = (path: string, match: string[]) => match.some((base) => (base === "/" ? path === "/" : path === base || path.startsWith(`${base}/`)));

export function Header() {
  const auth = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [path]);

  return (
    <header className={`sticky top-0 z-40 transition-colors ${scrolled || path !== "/" ? "border-b border-gold/15 bg-night/90 backdrop-blur-md" : "bg-transparent"}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-6 xl:gap-7 lg:flex" aria-label="Primary">
          {links.map((link) => {
            const active = isActive(path, link.match);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`relative pb-1 text-[12.5px] uppercase tracking-[0.14em] transition hover:text-gold ${active ? "text-gold" : "text-cream"}`}>
                {link.label}
                {active ? <span className="absolute inset-x-1 -bottom-0.5 h-px bg-gold" /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/app" className="btn-ghost px-4 py-2.5 text-sm">
            Get the app
          </Link>
          {auth.rider ? (
            <div className="flex items-center gap-2">
              <Link href="/bookings" className="flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2.5 text-sm">
                <User size={15} className="text-gold" /> {auth.rider.name ? auth.rider.name.split(" ")[0] : `+91 ${auth.rider.phone.slice(-4)}`}
              </Link>
              <button type="button" aria-label="Log out" onClick={() => void auth.logout()} className="rounded-full border border-gold/20 p-2.5 text-cream/60 hover:text-cream">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button type="button" className="btn px-5 py-2.5 text-sm" onClick={() => void auth.login()}>
              Log in
            </button>
          )}
        </div>
        <button type="button" className="rounded-full border border-gold/30 p-2.5 lg:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open ? (
        <div className="border-t border-gold/15 bg-night px-5 pb-6 lg:hidden">
          <nav className="flex flex-col py-2">
            {links.map((link) => {
              const active = isActive(path, link.match);
              return (
                <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 border-b border-gold/10 py-3.5 text-sm uppercase tracking-[0.14em] transition hover:text-gold ${active ? "text-gold" : "text-cream/85"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-gold" : "bg-transparent"}`} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/app" className="btn-ghost">
              Get the app
            </Link>
            {auth.rider ? (
              <Link href="/bookings" className="btn">
                <Ticket size={16} /> My trips
              </Link>
            ) : (
              <button type="button" className="btn" onClick={() => void auth.login()}>
                Log in
              </button>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
