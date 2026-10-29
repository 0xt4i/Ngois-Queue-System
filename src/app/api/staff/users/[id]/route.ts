import { hashPassword, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, json, parseBody, route } from "@/lib/http";
import { UUID_RE } from "@/lib/staff-action";
import { updateUserSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const COLUMNS = "id, username, display_name, role, is_active, created_at";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route("users-update", async (req, { params }: Ctx) => {
  const auth = await requireStaff(req, { role: "OWNER" });
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
  const body = await parseBody(req, updateUserSchema);
  if (body.response) return body.response;
  const u = body.data;

  if (id === auth.staff.id && (u.isActive === false || u.role === "STAFF")) {
    return apiError(409, "SELF_LOCKOUT", "Bạn không thể tự khoá hoặc tự hạ quyền tài khoản của mình.");
  }

  const patch: Record<string, unknown> = {};
  if (u.displayName !== undefined) patch.display_name = u.displayName;
  if (u.role !== undefined) patch.role = u.role;
  if (u.isActive !== undefined) patch.is_active = u.isActive;
  if (u.password !== undefined) patch.password_hash = await hashPassword(u.password);

  const { data, error } = await db()
    .from("staff_users")
    .update(patch)
    .eq("id", id)
    .eq("shop_id", auth.staff.shopId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");

  // Khoá tài khoản hoặc đổi mật khẩu → đăng xuất mọi phiên của tài khoản đó
  if (u.isActive === false || u.password !== undefined) {
    await db().from("staff_sessions").delete().eq("staff_id", id);
  }
  await db().from("audit_logs").insert({
    shop_id: auth.staff.shopId,
    staff_id: auth.staff.id,
    action: "USER_UPDATE",
    payload: { userId: id, fields: Object.keys(patch).filter((k) => k !== "password_hash").concat(u.password ? ["password"] : []) },
  });
  return json({ ok: true, user: data });
});

export const DELETE = route("users-delete", async (req, { params }: Ctx) => {
  const auth = await requireStaff(req, { role: "OWNER" });
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
  if (id === auth.staff.id) return apiError(409, "SELF_LOCKOUT", "Bạn không thể xoá tài khoản của chính mình.");
  const { data, error } = await db()
    .from("staff_users")
    .delete()
    .eq("id", id)
    .eq("shop_id", auth.staff.shopId)
    .select("username")
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
  await db().from("audit_logs").insert({
    shop_id: auth.staff.shopId,
    staff_id: auth.staff.id,
    action: "USER_DELETE",
    payload: { username: data.username },
  });
  return json({ ok: true });
});
