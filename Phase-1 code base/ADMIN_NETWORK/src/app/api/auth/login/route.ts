import { z } from "zod";
import { readBody, route } from "@/lib/server/api";
import { login } from "@/lib/server/auth";
import { allow, clientAddress } from "@/lib/server/rateLimit";

const schema = z.object({
  email: z.string().trim().email("Enter your work email."),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = route(async (req) => {
  const input = await readBody(req, schema);
  const address = clientAddress(req);
  await allow("admin-login-ip", address, 30, 600, "Too many sign-in attempts. Wait ten minutes and try again.");
  await allow("admin-login", input.email.toLowerCase(), 10, 600, "Too many sign-in attempts. Wait ten minutes and try again.");
  return { admin: await login(input.email, input.password) };
});
