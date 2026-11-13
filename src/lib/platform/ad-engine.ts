export type AdApp = "rider" | "captain";

export type Targeting = { apps: string[]; cities: string[]; vehicles: string[]; hours: number[]; min_trips: number };

export type CampaignCandidate = {
  id: string;
  pricing: "cpm" | "cpc";
  bid_paise: number;
  impressions: number;
  clicks: number;
  daily_budget_paise: number;
  total_budget_paise: number;
  spent_paise: number;
  spent_today_paise: number;
  spent_day: string | null;
  starts_at: string;
  ends_at: string | null;
  targeting: Targeting;
};

export type AdContext = { app: AdApp; city?: string | null; vehicle?: string | null; hour: number; trips: number; day: string; now: number };

export type Winner = { campaign: CampaignCandidate; ecpm: number; clearingCpm: number; pricePerImpression: number; pricePerClick: number };

const PRIOR_CTR = 0.015;
const PRIOR_WEIGHT = 200;

export function eligible(campaign: CampaignCandidate, ctx: AdContext) {
  const t = campaign.targeting;
  if (Date.parse(campaign.starts_at) > ctx.now) return false;
  if (campaign.ends_at && Date.parse(campaign.ends_at) <= ctx.now) return false;
  if (t.apps.length && !t.apps.includes(ctx.app)) return false;
  if (t.cities.length && (!ctx.city || !t.cities.includes(ctx.city))) return false;
  if (t.vehicles.length && (!ctx.vehicle || !t.vehicles.includes(ctx.vehicle))) return false;
  if (t.hours.length && !t.hours.includes(ctx.hour)) return false;
  if (ctx.trips < (t.min_trips ?? 0)) return false;
  const spentToday = campaign.spent_day === ctx.day ? Number(campaign.spent_today_paise) : 0;
  if (spentToday >= campaign.daily_budget_paise) return false;
  if (Number(campaign.spent_paise) >= campaign.total_budget_paise) return false;
  return true;
}

// Smoothed click-through rate, so new campaigns start at the network average.
export function predictedCtr(campaign: Pick<CampaignCandidate, "impressions" | "clicks">) {
  return (campaign.clicks + PRIOR_CTR * PRIOR_WEIGHT) / (campaign.impressions + PRIOR_WEIGHT);
}

// Expected revenue per 1000 impressions, in paise, so CPM and CPC bids compete fairly.
export function ecpm(campaign: CampaignCandidate) {
  return campaign.pricing === "cpm" ? campaign.bid_paise : campaign.bid_paise * predictedCtr(campaign) * 1000;
}

// Generalised second-price auction: each winner pays just above the next bid (or the reserve).
export function runAuction(candidates: CampaignCandidate[], slots: number, reserveCpm: number): Winner[] {
  const ranked = candidates
    .map((campaign) => ({ campaign, ecpm: ecpm(campaign) }))
    .filter((entry) => entry.ecpm >= reserveCpm)
    .sort((a, b) => b.ecpm - a.ecpm || a.campaign.id.localeCompare(b.campaign.id));
  return ranked.slice(0, Math.max(0, slots)).map((entry, index) => {
    const next = ranked[index + 1]?.ecpm ?? reserveCpm;
    const clearingCpm = Math.min(entry.ecpm, Math.max(reserveCpm, next) + 1);
    const ctr = predictedCtr(entry.campaign);
    return {
      campaign: entry.campaign,
      ecpm: entry.ecpm,
      clearingCpm,
      pricePerImpression: entry.campaign.pricing === "cpm" ? round4(clearingCpm / 1000) : 0,
      pricePerClick: entry.campaign.pricing === "cpc" ? round4(Math.min(entry.campaign.bid_paise, clearingCpm / (ctr * 1000))) : 0,
    };
  });
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
