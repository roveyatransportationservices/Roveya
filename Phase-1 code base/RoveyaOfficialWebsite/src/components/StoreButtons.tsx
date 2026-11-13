import { Download } from "lucide-react";
import { APK_URL, APP_STORE_URL, PLAY_URL } from "@/lib/format";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path fill="#D6A000" d="M3.6 2.3 13.4 12 3.6 21.7c-.4-.2-.6-.6-.6-1.1V3.4c0-.5.2-.9.6-1.1Z" />
      <path fill="#E0B23A" d="m16.6 15.2-3.2-3.2 3.2-3.2 3.7 2.1c.9.5.9 1.8 0 2.3l-3.7 2Z" />
      <path fill="#F6F1DC" d="M13.4 12 3.6 21.7c.3.2.8.2 1.2 0l11.8-6.5-3.2-3.2Z" opacity=".85" />
      <path fill="#F6F1DC" d="M13.4 12 16.6 8.8 4.8 2.3c-.4-.2-.9-.2-1.2 0L13.4 12Z" opacity=".6" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path fill="#F6F1DC" d="M16.4 12.7c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.9-1.1-2.9-4.3ZM13.9 5.3c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z" />
    </svg>
  );
}

// Store links come from the environment so they switch on the day the apps are published.
export function StoreButtons({ compact, play = PLAY_URL, appStore = APP_STORE_URL, apk = APK_URL }: { compact?: boolean; play?: string; appStore?: string; apk?: string }) {
  const base = `flex items-center gap-3 rounded-2xl border border-gold/30 bg-night/70 ${compact ? "px-3.5 py-2.5" : "px-5 py-3.5"} transition hover:border-gold`;
  const Store = ({ href, icon, top, name }: { href: string; icon: React.ReactNode; top: string; name: string }) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer" className={base}>
        {icon}
        <span className="text-left leading-tight">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-cream/55">{top}</span>
          <span className="block text-sm font-semibold">{name}</span>
        </span>
      </a>
    ) : (
      <span className={`${base} cursor-default opacity-80`} title="Launching soon">
        {icon}
        <span className="text-left leading-tight">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-gold">Coming soon</span>
          <span className="block text-sm font-semibold">{name}</span>
        </span>
      </span>
    );
  return (
    <div className="flex flex-wrap gap-3">
      <Store href={play} icon={<PlayIcon />} top="Get it on" name="Google Play" />
      <Store href={appStore} icon={<AppleIcon />} top="Download on the" name="App Store" />
      {apk ? (
        <a href={apk} className={base}>
          <Download size={22} className="text-gold" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-cream/55">Android</span>
            <span className="block text-sm font-semibold">Download APK</span>
          </span>
        </a>
      ) : null}
    </div>
  );
}
