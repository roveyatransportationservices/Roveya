import { randomBytes } from "node:crypto";
import { ApiError } from "./api";
import { controls } from "./db";

export const ADMIN_COLUMNS = "id,email,name,phone,role,active,must_change_password,last_login_at,locked_until,created_at";

export async function roleExists(key: string) {
  const found = await controls().from("roles").select("key").eq("key", key).maybeSingle();
  if (!found.data) throw new ApiError("That role does not exist. Create it under Roles first.", 400);
}

export const oneTimePassword = () => `${randomBytes(9).toString("base64url")}${Math.floor(10 + Math.random() * 89)}`;
