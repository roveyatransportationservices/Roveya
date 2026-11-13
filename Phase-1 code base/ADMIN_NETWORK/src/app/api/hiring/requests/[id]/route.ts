import { z } from "zod";
import { ApiError, check, readBody, route } from "@/lib/server/api";
import { audit, hashPassword, requireAdmin } from "@/lib/server/auth";
import { controls } from "@/lib/server/db";
import { ADMIN_COLUMNS, oneTimePassword, roleExists } from "@/lib/server/team";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  role: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

// Only the CEO (founder) approves a new team email. Approving creates the login with a one-time password.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const admin = await requireAdmin("admins.manage");
  if (admin.role !== "super_admin") throw new ApiError("Only the CEO can approve or reject a new team email.", 403);
  if (!/^\d+$/.test(id)) throw new ApiError("Request not found.", 404);
  const input = await readBody(req, schema);
  const request = check(await controls().from("access_requests").select("*").eq("id", id).maybeSingle(), "Request not found.");
  if (request.status !== "pending") throw new ApiError("This request was already decided.", 409);
  const now = new Date().toISOString();

  if (input.action === "reject") {
    check(await controls().from("access_requests").update({ status: "rejected", decided_by: admin.id, decided_at: now, decision_note: input.note || null }).eq("id", id).select("id").single());
    await audit(admin, "access.reject", "access_request", id, { email: request.email, note: input.note ?? null });
    return { ok: true };
  }

  const role = input.role ?? request.role;
  if (!role) throw new ApiError("Pick the job role this person gets.", 400);
  if (role === "super_admin") throw new ApiError("The founder role cannot be given from a request.", 400);
  await roleExists(role);
  const { data: taken } = await controls().from("admins").select("id").eq("email", request.email).maybeSingle();
  if (taken) throw new ApiError("This email already has a login.", 409);
  const password = oneTimePassword();
  const created = check(
    await controls()
      .from("admins")
      .insert({ email: request.email, name: input.name ?? request.name, role, phone: request.phone, password_hash: await hashPassword(password), must_change_password: true, created_by: admin.id })
      .select(ADMIN_COLUMNS)
      .single(),
  );
  check(await controls().from("access_requests").update({ status: "approved", role, decided_by: admin.id, decided_at: now, decision_note: input.note || null, admin_id: created.id }).eq("id", id).select("id").single());
  await audit(admin, "access.approve", "access_request", id, { email: request.email, role, adminId: created.id });
  return { admin: created, password };
});
