import { campaignSchema, createCampaign, listCampaigns } from "@/lib/platform/ads";
import { handler, readBody } from "@/lib/platform/gateway";
import { audit, requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  return listCampaigns();
});

export const POST = handler(async (request) => {
  const staff = await requireDesk(request);
  const result = await createCampaign(await readBody(request, campaignSchema));
  await audit(staff, "campaign.create", "ad_campaign", String((result as { campaign?: { id?: string } }).campaign?.id ?? ""), null, null);
  return result;
});
