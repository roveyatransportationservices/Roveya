import { z } from "zod";
import { ApiError, readBody, route } from "@/lib/server/api";
import { controls } from "@/lib/server/db";
import { allow, clientAddress } from "@/lib/server/rateLimit";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter the email you want to sign in with."),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.").optional().or(z.literal("")),
  jobTitle: z.string().trim().min(2, "Tell us your job at ROVEYA.").max(80),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

// A new team member asks for a login with their own email. Nothing opens until the CEO approves it.
export const POST = route(async (req) => {
  await allow("access", clientAddress(req), 5, 3600, "Too many requests from here. Try again in an hour.");
  const input = await readBody(req, schema);
  const { data: existing } = await controls().from("admins").select("id").eq("email", input.email).maybeSingle();
  if (existing) throw new ApiError("This email already has a ROVEYA login. Sign in, or ask the CEO to reset your password.", 409);
  const saved = await controls().from("access_requests").insert({ name: input.name, email: input.email, phone: input.phone || null, job_title: input.jobTitle, note: input.note || null, source: "login" }).select("id").single();
  if (saved.error?.code === "23505") throw new ApiError("Your request is already with the CEO. You will get your login once it is approved.", 409);
  if (saved.error) throw new ApiError("We could not send your request. Try again.", 500);
  return { ok: true };
});
