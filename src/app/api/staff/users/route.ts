import { hashPassword, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, json, parseBody, route } from "@/lib/http";
import { createUserSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const COLUMNS = "id, username, display_name, role, is_active, created_at";

export const GET = route("users-list", async (req) => {
  const auth = await requireStaff(req, { role: "OWNER" });
  if (auth.response) return auth.response;
  const { data, error } = await db().from("staff_users").select(COLUMNS).eq("shop_id", auth.staff.shopId).order("created_at");
  if (error) throw error;
  return json({ ok: true, users: data, me: auth.staff.id });
});

export const POST = route("users-create", async (req) => {
  const auth = await requireStaff(req, { role: "OWNER" });
  if (auth.response) return auth.response;
  const body = await parseBody(req, createUserSchema);
  if (body.response) return body.response;
  const u = body.data;
  const { data, error } = await db()
    .from("staff_users")
    .insert({
      shop_id: auth.staff.shopId,
      username: u.username,
      display_name: u.displayName,
      role: u.role,
      password_hash: await hashPassword(u.password),
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return apiError(409, "USERNAME_TAKEN", "Tên đăng nhập đã tồn tại.");
    throw error;
  }
  await db().from("audit_logs").insert({
    shop_id: auth.staff.shopId,
    staff_id: auth.staff.id,
    action: "USER_CREATE",
    payload: { username: u.username, role: u.role },
  });
  return json({ ok: true, user: data }, 201);
});
