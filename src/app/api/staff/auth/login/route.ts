import { createSession, sessionCookie, verifyLogin } from "@/lib/auth";
import { apiError, getClientIp, isSameOrigin, json, parseBody, route } from "@/lib/http";
import { logger } from "@/lib/logger";
import { LIMITS, rateHit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = route("login", async (req) => {
  if (!isSameOrigin(req)) return apiError(403, "CSRF", "Yêu cầu không hợp lệ.");
  const body = await parseBody(req, loginSchema);
  if (body.response) return body.response;
  const { username, password } = body.data;

  const key = `login:${getClientIp(req)}:${username}`;
  if ((await rateHit(key, LIMITS.login.window, 0)) >= LIMITS.login.max) {
    return apiError(429, "RATE_LIMITED", "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 10 phút.");
  }

  const user = await verifyLogin(username, password);
  if (!user) {
    await rateHit(key, LIMITS.login.window, 1);
    return apiError(401, "BAD_CREDENTIALS", "Sai tên đăng nhập hoặc mật khẩu.");
  }

  const { token, expires } = await createSession(user);
  logger.info({ staff: user.username }, "staff login");
  const res = json({ ok: true, user });
  res.cookies.set(sessionCookie(token, expires));
  return res;
});
