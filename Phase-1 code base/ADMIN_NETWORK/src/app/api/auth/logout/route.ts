import { route } from "@/lib/server/api";
import { logout } from "@/lib/server/auth";

export const POST = route(async () => {
  await logout();
  return { ok: true };
});
