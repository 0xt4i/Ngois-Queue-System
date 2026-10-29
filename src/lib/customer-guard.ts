import type { NextRequest } from "next/server";
import { apiError, getClientIp } from "./http";
import { LIMITS, rateHit } from "./rate-limit";

const TOO_MANY = "Bạn nhập sai mã quá nhiều lần. Vui lòng thử lại sau 10 phút hoặc nhờ nhân viên hỗ trợ.";

function keys(req: NextRequest) {
  const ip = getClientIp(req);
  const device = (req.headers.get("x-device-id") ?? "none").slice(0, 64);
  return { ip, device };
}

/** Kiểm tra giới hạn trước khi xử lý request lấy số / tra cứu. Trả về Response nếu bị chặn. */
export async function checkCustomerLimits(req: NextRequest): Promise<Response | null> {
  const { ip, device } = keys(req);
  const [total, badDevice, badIp] = await Promise.all([
    rateHit(`ticket:ip:${ip}`, LIMITS.ticketPerIp.window, 1),
    rateHit(`badcode:dev:${ip}:${device}`, LIMITS.badCodePerDevice.window, 0),
    rateHit(`badcode:ip:${ip}`, LIMITS.badCodePerIp.window, 0),
  ]);
  if (total > LIMITS.ticketPerIp.max) {
    return apiError(429, "RATE_LIMITED", "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.");
  }
  if (badDevice >= LIMITS.badCodePerDevice.max || badIp >= LIMITS.badCodePerIp.max) {
    return apiError(429, "TOO_MANY_BAD_CODES", TOO_MANY);
  }
  return null;
}

/** Ghi nhận 1 lần nhập sai mã ngày. */
export async function recordBadCode(req: NextRequest) {
  const { ip, device } = keys(req);
  await Promise.all([
    rateHit(`badcode:dev:${ip}:${device}`, LIMITS.badCodePerDevice.window, 1),
    rateHit(`badcode:ip:${ip}`, LIMITS.badCodePerIp.window, 1),
  ]);
}
