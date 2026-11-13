import type { Metadata } from "next";
import { MobileCheckout } from "@/components/pay/MobileCheckout";

export const metadata: Metadata = {
  title: "ROVEYA Payment",
  robots: { index: false, follow: false },
};

export default async function MobileCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <div className="min-h-dvh bg-[#12060D] text-[#F6F1DC]">
      <MobileCheckout
        orderId={params.order ?? ""}
        keyId={params.key ?? ""}
        amountPaise={Number(params.amount ?? 0)}
        token={params.token ?? ""}
        purpose={params.purpose ?? "wallet_topup"}
      />
    </div>
  );
}
