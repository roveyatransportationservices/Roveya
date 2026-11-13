import "server-only";
import { randomUUID } from "crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { eligible, runAuction, type AdApp, type CampaignCandidate } from "@/lib/platform/ad-engine";
import { db, dbError, must, rupees, secret, siteUrl } from "@/lib/platform/gateway";
import { istHour } from "@/lib/platform/pricing";
import { signToken, verifyToken } from "@/lib/platform/tokens";

export const SLOTS = ["rider_home", "rider_trip", "captain_duty", "captain_tabs"] as const;
export type Slot = (typeof SLOTS)[number];

type AdToken = { t: string; c: string; cr: string; u: string; s: Slot; k: "cpm" | "cpc"; p: number; exp: number };

function istDay() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

async function audience(userId: string, app: AdApp) {
  const client = db();
  if (app === "captain") {
    const { data } = await client.from("captains").select("city,vehicle").eq("user_id", userId).maybeSingle();
    const { count } = await client.from("trips").select("id", { count: "exact", head: true }).eq("captain_id", userId).eq("status", "completed");
    return { city: data?.city ?? null, vehicle: data?.vehicle ?? null, trips: count ?? 0 };
  }
  const { count } = await client.from("trips").select("id", { count: "exact", head: true }).eq("rider_id", userId).eq("status", "completed");
  return { city: null, vehicle: null, trips: count ?? 0 };
}

export async function serveAds(userId: string, slot: Slot, count: number) {
  const app: AdApp = slot.startsWith("captain") ? "captain" : "rider";
  const client = db();
  const { data: rows } = await client
    .from("ad_campaigns")
    .select("id,pricing,bid_paise,impressions,clicks,daily_budget_paise,total_budget_paise,spent_paise,spent_today_paise,spent_day,starts_at,ends_at,ad_targeting(apps,cities,vehicles,hours,min_trips),ad_creatives!inner(id,slot,kicker,title,cta,image_url,link_url,active)")
    .eq("status", "active")
    .eq("ad_creatives.slot", slot)
    .eq("ad_creatives.active", true)
    .limit(100);

  const who = await audience(userId, app);
  const context = { app, city: who.city, vehicle: who.vehicle, trips: who.trips, hour: istHour(), day: istDay(), now: Date.now() };
  type Row = CampaignCandidate & { creatives: { id: string; kicker: string; title: string; cta: string | null; image_url: string; link_url: string | null }[] };
  const candidates: Row[] = (rows ?? []).map((row) => {
    const targeting = Array.isArray(row.ad_targeting) ? row.ad_targeting[0] : row.ad_targeting;
    return {
      ...row,
      spent_paise: Number(row.spent_paise),
      spent_today_paise: Number(row.spent_today_paise),
      targeting: targeting ?? { apps: [], cities: [], vehicles: [], hours: [], min_trips: 0 },
      creatives: row.ad_creatives,
    } as Row;
  });
  const pool = candidates.filter((candidate) => eligible(candidate, context));
  const reserve = Number((await client.from("platform_settings").select("value").eq("key", "ad_reserve_cpm_paise").maybeSingle()).data?.value ?? 2000);
  const winners = runAuction(pool, Math.min(5, Math.max(1, count)), reserve);

  const secretKey = secret("ads");
  const exp = Date.now() + 30 * 60 * 1000;
  const ads = winners.map((winner) => {
    const row = winner.campaign as Row;
    const creative = row.creatives[Math.floor(Math.random() * row.creatives.length)];
    const price = row.pricing === "cpm" ? winner.pricePerImpression : winner.pricePerClick;
    const token = signToken({ t: randomUUID(), c: row.id, cr: creative.id, u: userId, s: slot, k: row.pricing, p: price, exp } satisfies AdToken, secretKey);
    return {
      token,
      kicker: creative.kicker,
      title: creative.title,
      cta: creative.cta,
      image: creative.image_url.startsWith("http") ? creative.image_url : siteUrl(creative.image_url),
      link: creative.link_url,
    };
  });
  return { slot, ads };
}

export const adEventSchema = z.object({ token: z.string().min(20).max(1200), kind: z.enum(["impression", "click"]) });

export async function trackAd(userId: string, input: z.infer<typeof adEventSchema>) {
  const payload = verifyToken<AdToken>(input.token, secret("ads"));
  if (!payload || payload.u !== userId) throw new AppError("This ad has expired.", 410);
  const charged = (input.kind === "impression" && payload.k === "cpm") || (input.kind === "click" && payload.k === "cpc");
  const { error } = await db().from("ad_events").insert({
    token_id: payload.t,
    kind: input.kind,
    campaign_id: payload.c,
    creative_id: payload.cr,
    user_id: userId,
    slot: payload.s,
    price_paise: charged ? payload.p : 0,
  });
  if (error?.code === "23505") return { ok: true, duplicate: true };
  const failure = dbError(error);
  if (failure) throw failure;
  return { ok: true, duplicate: false };
}

// ---------------------------------------------------------------------------
// Campaign service (desk only)
// ---------------------------------------------------------------------------

export const advertiserSchema = z.object({ name: z.string().trim().min(2).max(120), contactEmail: z.string().trim().email().optional() });

export async function createAdvertiser(input: z.infer<typeof advertiserSchema>) {
  return { advertiser: must(await db().from("advertisers").insert({ name: input.name, contact_email: input.contactEmail ?? null }).select("*").single()) };
}

export async function listAdvertisers() {
  const client = db();
  const { data } = await client.from("advertisers").select("id,name,contact_email,created_at").order("created_at", { ascending: false }).limit(200);
  const ids = (data ?? []).map((row) => row.id);
  const { data: wallets } = ids.length ? await client.from("wallets").select("owner_id,balance_paise").in("owner_id", ids) : { data: [] };
  const balance = new Map((wallets ?? []).map((row) => [row.owner_id, rupees(Number(row.balance_paise))]));
  return { advertisers: (data ?? []).map((row) => ({ ...row, balance: balance.get(row.id) ?? 0 })) };
}

const creativeSchema = z.object({
  slot: z.enum(SLOTS),
  kicker: z.string().trim().min(2).max(40),
  title: z.string().trim().min(4).max(90),
  cta: z.string().trim().max(24).optional(),
  imageUrl: z.string().trim().min(4).max(500),
  linkUrl: z.string().trim().max(500).optional(),
});

export const campaignSchema = z.object({
  advertiserId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  pricing: z.enum(["cpm", "cpc"]),
  bid: z.number().positive().max(100000),
  dailyBudget: z.number().positive().max(10000000),
  totalBudget: z.number().positive().max(100000000),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  targeting: z
    .object({
      apps: z.array(z.enum(["rider", "captain"])).default(["rider", "captain"]),
      cities: z.array(z.string().trim().min(2)).default([]),
      vehicles: z.array(z.enum(["bike", "auto", "cab"])).default([]),
      hours: z.array(z.number().int().min(0).max(23)).default([]),
      minTrips: z.number().int().min(0).default(0),
    })
    .default({}),
  creatives: z.array(creativeSchema).min(1).max(10),
});

export async function createCampaign(input: z.infer<typeof campaignSchema>) {
  if (input.totalBudget < input.dailyBudget) throw new AppError("The total budget must cover at least one day.", 400);
  const client = db();
  const campaign = must(
    await client
      .from("ad_campaigns")
      .insert({
        advertiser_id: input.advertiserId,
        name: input.name,
        pricing: input.pricing,
        bid_paise: Math.round(input.bid * 100),
        daily_budget_paise: Math.round(input.dailyBudget * 100),
        total_budget_paise: Math.round(input.totalBudget * 100),
        starts_at: input.startsAt ?? new Date().toISOString(),
        ends_at: input.endsAt ?? null,
      })
      .select("*")
      .single(),
  ) as { id: string };
  const t = input.targeting;
  const targeting = await client.from("ad_targeting").insert({ campaign_id: campaign.id, apps: t.apps, cities: t.cities, vehicles: t.vehicles, hours: t.hours, min_trips: t.minTrips });
  const creatives = await client.from("ad_creatives").insert(
    input.creatives.map((creative) => ({ campaign_id: campaign.id, slot: creative.slot, kicker: creative.kicker, title: creative.title, cta: creative.cta ?? null, image_url: creative.imageUrl, link_url: creative.linkUrl ?? null })),
  );
  const failure = dbError(targeting.error) ?? dbError(creatives.error);
  if (failure) throw failure;
  return { campaign };
}

export const campaignUpdateSchema = z.object({
  status: z.enum(["draft", "active", "paused", "ended"]).optional(),
  bid: z.number().positive().max(100000).optional(),
  dailyBudget: z.number().positive().optional(),
  totalBudget: z.number().positive().optional(),
});

export async function updateCampaign(id: string, input: z.infer<typeof campaignUpdateSchema>) {
  const patch: Record<string, unknown> = {};
  if (input.status) patch.status = input.status;
  if (input.bid) patch.bid_paise = Math.round(input.bid * 100);
  if (input.dailyBudget) patch.daily_budget_paise = Math.round(input.dailyBudget * 100);
  if (input.totalBudget) patch.total_budget_paise = Math.round(input.totalBudget * 100);
  return { campaign: must(await db().from("ad_campaigns").update(patch).eq("id", id).select("*").single()) };
}

export async function listCampaigns() {
  const { data } = await db()
    .from("ad_campaigns")
    .select("id,name,status,pricing,bid_paise,daily_budget_paise,total_budget_paise,spent_paise,impressions,clicks,starts_at,ends_at,advertisers(name),ad_creatives(id,slot,title,active)")
    .order("created_at", { ascending: false })
    .limit(200);
  return {
    campaigns: (data ?? []).map((row) => ({
      ...row,
      bid: rupees(row.bid_paise),
      dailyBudget: rupees(row.daily_budget_paise),
      totalBudget: rupees(row.total_budget_paise),
      spent: Math.round(Number(row.spent_paise)) / 100,
      ctr: row.impressions ? Math.round((row.clicks / row.impressions) * 10000) / 100 : 0,
    })),
  };
}
