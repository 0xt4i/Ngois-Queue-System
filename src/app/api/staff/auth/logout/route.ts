import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { apiError, isSameOrigin, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route("logout", async (req) => {
  if (!isSameOrigin(req)) return apiError(403, "CSRF", "Yêu cầu không hợp lệ.");
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
