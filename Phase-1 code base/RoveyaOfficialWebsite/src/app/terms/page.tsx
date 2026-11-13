import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { termsSections } from "@/lib/content";
import { CANCELLATION_SLABS } from "@/lib/rules";

export const metadata: Metadata = { title: "Terms and cancellation policy" };

export default function TermsPage() {
  const slabs = {
    title: "Cancellation and Refunds",
    items: [
      ...CANCELLATION_SLABS.map((slab) => ({ q: slab.label, body: `${slab.refund}% of the fare back to ROVEYA Cash.` })),
      { body: "With Secure your trip, cancelling at least 6 hours before departure refunds the full fare. The Secure your trip fee itself is not refunded." },
    ],
  };
  return <Prose kicker="Legal" title="Terms and cancellation" intro="These terms apply to every seat booked on the ROVEYA website and apps." sections={[slabs, ...termsSections]} />;
}
