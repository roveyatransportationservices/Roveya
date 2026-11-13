import { z } from "zod";
import { readBody, route } from "@/lib/server/api";
import { requireAdmin, saveTheme, THEMES } from "@/lib/server/auth";

const schema = z.object({ theme: z.enum(THEMES) });

// Every team member picks their own theme; it follows them to any device they log in on.
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const { theme } = await readBody(req, schema);
  await saveTheme(admin, theme);
  return { theme };
});
