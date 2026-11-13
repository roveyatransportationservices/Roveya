import { adjustSchema, adjustWallet, walletDetail } from "@/lib/platform/admin";
import { handler, readBody } from "@/lib/platform/gateway";
import { requireDesk } from "@/lib/platform/staff";

export const GET = handler<{ ownerId: string }>(async (request, { ownerId }) => {
  await requireDesk(request);
  return walletDetail(ownerId);
});

export const POST = handler<{ ownerId: string }>(async (request, { ownerId }) => {
  const staff = await requireDesk(request, { ceo: true });
  return adjustWallet(staff, ownerId, await readBody(request, adjustSchema));
});
