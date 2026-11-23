"use client";

import { Headset } from "lucide-react";
import { useAuth } from "./Auth";
import { DeskChat } from "./DeskChat";

export function HelpDesk({ pnr }: { pnr?: string }) {
  const { rider, ready, login } = useAuth();
  if (!ready) return <div className="skeleton h-[560px] rounded-3xl" />;
  if (!rider) {
    return (
      <div className="card flex flex-col items-center p-12 text-center">
        <Headset size={36} className="text-gold" />
        <p className="mt-4 text-xl font-semibold">Chat with the ROVEYA desk</p>
        <p className="mt-2 max-w-md text-sm text-cream/60">Log in with your mobile number so the agent can see your bookings and help faster.</p>
        <button type="button" className="btn mt-6" onClick={() => void login()}>
          Log in to chat
        </button>
      </div>
    );
  }
  return <DeskChat pnr={pnr} />;
}
