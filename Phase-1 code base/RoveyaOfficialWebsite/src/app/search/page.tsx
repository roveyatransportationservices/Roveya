import type { Metadata } from "next";
import { Results } from "@/components/Results";
import { cityName, todayIso } from "@/lib/format";
import { cityById } from "@/lib/rules";

type Params = Promise<{ from?: string; to?: string; date?: string; women?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const { from = "hyd", to = "vja" } = await searchParams;
  return { title: `${cityName(from)} to ${cityName(to)} car seats`, description: `Book a seat in a verified car from ${cityName(from)} to ${cityName(to)}. Pick your exact seat and track the car live.` };
}

export default async function SearchPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const from = params.from && cityById(params.from) ? params.from : "hyd";
  const to = params.to && cityById(params.to) && params.to !== from ? params.to : from === "vja" ? "hyd" : "vja";
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date >= todayIso() ? params.date : todayIso();
  return <Results key={`${from}-${to}-${date}`} from={from} to={to} date={date} women={params.women === "1"} />;
}
