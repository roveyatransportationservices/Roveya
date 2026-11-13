import { z } from "zod";
import { readBody, route } from "@/lib/server/api";
import { login } from "@/lib/server/auth";

const schema = z.object({
  email: z.string().trim().email("Enter your work email."),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = route(async (req) => {
  const input = await readBody(req, schema);
  return { admin: await login(input.email, input.password) };
});
