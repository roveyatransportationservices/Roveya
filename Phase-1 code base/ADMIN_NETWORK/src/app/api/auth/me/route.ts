import { route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";

export const GET = route(async () => ({ admin: await requireAdmin() }));
