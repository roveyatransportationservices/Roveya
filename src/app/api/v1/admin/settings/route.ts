import { handler, readBody } from "@/lib/platform/gateway";
import { deskSettings, settingsUpdateSchema, updateSettings } from "@/lib/platform/settings";
import { audit, requireDesk } from "@/lib/platform/staff";

export const GET = handler(async (request) => {
  await requireDesk(request);
  return deskSettings();
});

export const PATCH = handler(async (request) => {
  const staff = await requireDesk(request, { ceo: true });
  const input = await readBody(request, settingsUpdateSchema);
  const result = await updateSettings(input);
  await audit(staff, "settings.update", "platform_settings", "fares", result.before, input.values);
  return { settings: result.settings };
});
