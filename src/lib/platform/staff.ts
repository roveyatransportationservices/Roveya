import "server-only";
import { readAdminSession, type StaffSession } from "@/lib/auth";
import { assertCeo, assertStaff } from "@/lib/domain/authz";
import { AppError, logServerError } from "@/lib/errors";
import { db } from "@/lib/platform/gateway";
import { bearer } from "@/lib/platform/session";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The admin desk runs on its own domain and sends its Supabase session as a bearer token.
export async function requireDesk(request: Request, options: { ceo?: boolean } = {}): Promise<StaffSession> {
  const token = bearer(request);
  let session: StaffSession | null = null;
  if (token) {
    const { data } = await db().auth.getUser(token);
    if (data.user) {
      const { data: row } = await db().from("admin_users").select("id,name,email,role").eq("auth_user_id", data.user.id).maybeSingle();
      if (row) session = { id: row.id, authUserId: data.user.id, email: row.email, name: row.name, role: assertStaff(row.role) };
    }
  } else {
    session = await readAdminSession();
  }
  if (!session) throw new AppError("Sign in to the ROVEYA desk.", 401);
  if (options.ceo) assertCeo(session.role);
  return session;
}

export async function audit(staff: StaffSession, action: string, entity: string, entityId: string, oldData?: unknown, newData?: unknown) {
  if (!uuid.test(staff.id)) return;
  const { error } = await db()
    .from("audit_logs")
    .insert({ user_id: staff.id, action, entity, entity_id: entityId, old_data: oldData ?? null, new_data: newData ?? null });
  if (error) logServerError("audit", new Error(error.message));
}
