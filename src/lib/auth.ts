import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { env } from "./env";
import { apiError, isSameOrigin } from "./http";
import type { StaffRole } from "./types";

export const SESSION_COOKIE = "pb_staff";
const SESSION_DAYS = 7;

export interface StaffUser {
  id: string;
  shopId: string;
  username: string;
  displayName: string;
  role: StaffRole;
}

let dummyHash: string | undefined;

const hashToken =(t: string) => createHash("sha256").update(t).digest("hex");

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyLogin(username: string, password: string): Promise<StaffUser | null> {
  const { data } = await db()
    .from("staff_users")
    .select("id, shop_id, username, display_name, role, is_active, password_hash")
    .eq("username", username)
    .maybeSingle();
  // So sánh với hash giả khi không có user để thời gian phản hồi như nhau
  dummyHash ??= bcrypt.hashSync("dummy-password", 10);
  const hash = data?.password_hash ?? dummyHash;
  const ok = await bcrypt.compare(password, hash);
  if (!data || !ok || !data.is_active) return null;
  return {
    id: data.id,
    shopId: data.shop_id,
    username: data.username,
    displayName: data.display_name,
    role: data.role,
  };
}

export async function createSession(user: StaffUser): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const { error } = await db().from("staff_sessions").insert({
    shop_id: user.shopId,
    staff_id: user.id,
    token_hash: hashToken(token),
    expires_at: expires.toISOString(),
  });
  if (error) throw error;
  return { token, expires };
}

export async function destroySession(token: string) {
  await db().from("staff_sessions").delete().eq("token_hash", hashToken(token));
}

export function sessionCookie(token: string, expires: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

interface SessionRow {
  expires_at: string;
  staff_users: {
    id: string;
    shop_id: string;
    username: string;
    display_name: string;
    role: StaffRole;
    is_active: boolean;
  } | null;
}

export async function staffFromToken(token: string | undefined): Promise<StaffUser | null> {
  if (!token) return null;
  const { data } = await db()
    .from("staff_sessions")
    .select("expires_at, staff_users!inner(id, shop_id, username, display_name, role, is_active)")
    .eq("token_hash", hashToken(token))
    .maybeSingle<SessionRow>();
  const u = data?.staff_users;
  if (!data || !u || !u.is_active || new Date(data.expires_at) < new Date()) return null;
  return { id: u.id, shopId: u.shop_id, username: u.username, displayName: u.display_name, role: u.role };
}

/** Dùng trong Server Component / page. */
export async function getStaff(): Promise<StaffUser | null> {
  const store = await cookies();
  return staffFromToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Dùng trong API route của nhân viên: kiểm tra phiên, quyền, và CSRF (với request thay đổi dữ liệu).
 * Trả về `{ staff }` hoặc `{ response }` lỗi.
 */
export async function requireStaff(
  req: NextRequest,
  opts: { role?: StaffRole } = {},
): Promise<{ staff: StaffUser; response?: undefined } | { staff?: undefined; response: Response }> {
  if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
    return { response: apiError(403, "CSRF", "Yêu cầu không hợp lệ.") };
  }
  const staff = await staffFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!staff) return { response: apiError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập lại.") };
  if (opts.role === "OWNER" && staff.role !== "OWNER") {
    return { response: apiError(403, "FORBIDDEN", "Chỉ chủ tiệm mới có quyền này.") };
  }
  return { staff };
}
