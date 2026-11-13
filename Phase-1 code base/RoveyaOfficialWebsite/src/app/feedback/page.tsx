import type { Metadata } from "next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { POPULAR_ROUTES, cityName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Rate your ride",
  description: "Tell us how your ROVEYA trip went. Your rating and words help every traveller choose with confidence.",
  robots: { index: false, follow: false },
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ car?: string; from?: string; to?: string }> }) {
  const { car, from, to } = await searchParams;
  const routes = [...POPULAR_ROUTES, ...POPULAR_ROUTES.map(([a, b]) => [b, a] as [string, string])]
    .filter(([a, b], at, all) => all.findIndex(([x, y]) => x === a && y === b) === at)
    .map(([a, b]) => `${cityName(a)} → ${cityName(b)}`);
  const preset = from && to ? `${cityName(from)} → ${cityName(to)}` : "";
  const plate = (car ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

  return (
    <div className="mx-auto max-w-xl px-5 py-10 sm:py-14">
      <p className="kicker">Rate your ride</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">How was your journey with ROVEYA?</h1>
      <p className="mt-4 text-cream/65">It takes less than a minute. Our team reads every review, and the best ones appear on our website.</p>
      <div className="mt-8">
        <FeedbackForm routes={routes} preset={preset} car={plate} />
      </div>
    </div>
  );
}
