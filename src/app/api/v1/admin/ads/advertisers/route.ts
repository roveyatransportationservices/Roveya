import { advertiserSchema, createAdvertiser, listAdvertisers } from "@/lib/platform/ads";
import { handler, readBody } from "@/lib/platform/gateway";
import { audit, requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  return listAdvertisers();
});

export const POST = handler(async (request) => {
  const staff = await requireDesk(request);
  const result = await createAdvertiser(await readBody(request, advertiserSchema));
  const advertiser = result.advertiser as { id: string };
  await audit(staff, "advertiser.create", "advertiser", advertiser.id, null, advertiser);
  return result;
});
