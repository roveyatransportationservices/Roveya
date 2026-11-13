import type { Metadata } from "next";
import { SupabaseBrowserConfig } from "@/components/supabase/SupabaseBrowserConfig";

export const metadata: Metadata = {
  title: "Pay For Your Ride",
  description: "Pay for your ROVEYA ride from your seat.",
  robots: { index: false, follow: false },
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseBrowserConfig
      url={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      publishableKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""}
    >
      <div className="min-h-dvh bg-[#12060D] text-[#F6F1DC]">{children}</div>
    </SupabaseBrowserConfig>
  );
}
