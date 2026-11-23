import type { Metadata } from "next";
import { Bell, MapPinned, Siren, Smartphone, Ticket, Wallet } from "lucide-react";
import { PhoneMock } from "@/components/PhoneMock";
import { StoreButtons } from "@/components/StoreButtons";
import { APK_URL, APP_STORE_URL, PLAY_URL, SITE_URL } from "@/lib/format";
import { qrFor } from "@/lib/qr";

export const metadata: Metadata = { title: "Download the ROVEYA app", description: "Book car seats, track your car live, and travel safer with the ROVEYA app for Android and iPhone." };

const features = [
  { icon: Ticket, title: "Book in a minute", line: "Search, pick your seat and pay with UPI. Your ticket lives in the app." },
  { icon: MapPinned, title: "Track the car live", line: "See the car on the map from boarding to drop, and share it with family." },
  { icon: Siren, title: "SOS on every ticket", line: "Hold for two seconds and the safety desk and your contacts get your location." },
  { icon: Bell, title: "Trip alerts", line: "Captain name, car number and boarding reminders arrive on your phone." },
  { icon: Wallet, title: "ROVEYA Cash", line: "Refunds land at once and pay for up to 20% of your next trip." },
  { icon: Smartphone, title: "One account", line: "Bookings from this website and the app show up in both places." },
];

export default async function AppPage() {
  const target = PLAY_URL || APK_URL || APP_STORE_URL || `${SITE_URL}/app`;
  const qr = await qrFor(target, 260);
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
      <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rise">
          <p className="kicker">The ROVEYA app</p>
          <h1 className="display mt-4 text-5xl sm:text-6xl lg:text-7xl">
            Your journey, <span className="text-gold">one tap away.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-cream/70">The quickest way to reserve a ROVEYA seat. Every booking comes with live tracking, SOS and trip alerts on your phone.</p>
          <div className="mt-10">
            <StoreButtons />
          </div>
          <div className="mt-10 flex items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code to download the ROVEYA app" className="h-36 w-36 rounded-2xl border border-gold/30" />
            <div>
              <p className="font-semibold">Scan to download</p>
              <p className="mt-1 max-w-xs text-sm leading-6 text-cream/60">Point your phone camera at the code. It opens the right store for your phone.</p>
            </div>
          </div>
        </div>
        <PhoneMock />
      </div>

      <div className="mt-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((item) => (
          <div key={item.title} className="card p-7">
            <item.icon size={26} className="text-gold" />
            <p className="mt-5 text-lg font-semibold">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-cream/65">{item.line}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
