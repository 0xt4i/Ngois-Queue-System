import { rpc } from "./db";

/**
 * Rate limit lưu trong Postgres (dùng chung giữa các serverless instance).
 * Trả về số lần đã ghi nhận trong cửa sổ hiện tại (sau khi cộng `inc`).
 */
export function rateHit(key: string, windowSeconds: number, inc = 1): Promise<number> {
  return rpc<number>("pb_rate_hit", { p_key: key, p_window_seconds: windowSeconds, p_inc: inc });
}

export const LIMITS = {
  /** Tổng số lần lấy số / tra cứu theo IP (wifi tiệm dùng chung IP nên để rộng). */
  ticketPerIp: { max: 60, window: 600 },
  /** Nhập sai mã ngày theo IP + thiết bị. */
  badCodePerDevice: { max: 5, window: 600 },
  /** Nhập sai mã ngày theo IP (chặn đoán mã bằng cách đổi thiết bị). */
  badCodePerIp: { max: 30, window: 600 },
  login: { max: 10, window: 600 },
} as const;
