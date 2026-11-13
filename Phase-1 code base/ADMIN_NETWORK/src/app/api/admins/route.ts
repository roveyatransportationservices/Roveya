import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, hashPassword, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { ADMIN_COLUMNS, oneTimePassword, roleExists } from "@/lib/server/team";

export const GET = route(async () => {
  await requireAdmin("admins.manage");
  const admins = check(await controls().from("admins").select(ADMIN_COLUMNS).order("created_at"));
  return { admins };
});

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a work email."),
  name: z.string().trim().min(2, "Enter their name.").max(80),
  role: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/, "Pick a role."),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.").optional().or(z.literal("")),
});

// New admins get a one-time password shown once; they set their own after logging in.
// Only the CEO (founder) creates a login directly; anyone else's addition waits for the CEO's approval.
export const POST = route(async (req) => {
  const admin = await requireAdmin("admins.manage");
  const input = await readBody(req, schema);
  await roleExists(input.role);
  if (input.role === "super_admin" && admin.role !== "super_admin") throw new ApiError("Only the CEO can give the founder role.", 403);
  const { data: taken } = await controls().from("admins").select("id").eq("email", input.email).maybeSingle();
  if (taken) throw new ApiError("This email already has a login.", 409);
  if (admin.role !== "super_admin") {
    const saved = await controls().from("access_requests").insert({ name: input.name, email: input.email, phone: input.phone || null, role: input.role, source: "team", requested_by: admin.id }).select("id").single();
    if (saved.error?.code === "23505") throw new ApiError("A request for this email is already waiting for the CEO.", 409);
    check(saved);
    await audit(admin, "access.request", "access_request", String(saved.data?.id), { email: input.email, role: input.role });
    return { pending: true };
  }
  const password = oneTimePassword();
  const created = check(
    await controls()
      .from("admins")
      .insert({ email: input.email, name: input.name, role: input.role, phone: input.phone || null, password_hash: await hashPassword(password), must_change_password: true, created_by: admin.id })
      .select(ADMIN_COLUMNS)
      .single(),
  );
  await audit(admin, "admin.create", "admin", created.id, { email: input.email, role: input.role });
  return { admin: created, password };
});
