import { campaignUpdateSchema, updateCampaign } from "@/lib/platform/ads";
import { handler, readBody } from "@/lib/platform/gateway";
import { audit, requireDesk } from "@/lib/platform/staff";

export const PATCH = handler<{ id: string }>(async (request, { id }) => {
  const staff = await requireDesk(request);
  const input = await readBody(request, campaignUpdateSchema);
  const result = await updateCampaign(id, input);
  await audit(staff, "campaign.update", "ad_campaign", id, null, input);
  return result;
});
