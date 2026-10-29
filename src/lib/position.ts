import type { QueueSnapshot } from "./types";

export type DerivedPosition =
  | { status: "SERVING" }
  | { status: "WAITING"; ahead: number; recalled: boolean }
  | { status: "SKIPPED"; turnsLeft: number }
  | { status: "UNKNOWN" };

/**
 * Tính vị trí của 1 vé từ snapshot công khai (không cần dữ liệu cá nhân).
 * Lượt phía trước = vị trí trong hàng (vé "Gọi lại" đứng trước WAITING) + 1 nếu đang có người chụp.
 * UNKNOWN = vé không còn trong hàng (DONE/EXPIRED/CANCELLED) → client tải lại chi tiết vé.
 */
export function derivePosition(snap: QueueSnapshot, number: number): DerivedPosition {
  if (snap.currentNumber === number) return { status: "SERVING" };
  const idx = snap.queue.indexOf(number);
  if (idx >= 0) {
    const recalled = snap.skippedInGrace.some((s) => s.number === number && s.recalled);
    return { status: "WAITING", ahead: idx + (snap.currentNumber != null ? 1 : 0), recalled };
  }
  const skipped = snap.skippedInGrace.find((s) => s.number === number);
  if (skipped) return { status: "SKIPPED", turnsLeft: skipped.turnsLeft };
  return { status: "UNKNOWN" };
}

/** Ước lượng thời gian chờ (giây) = số lượt phía trước × thời gian chụp trung bình. */
export function estimateWaitSeconds(ahead: number, snap: QueueSnapshot): number {
  return ahead * snap.avgServiceSeconds;
}

export const NEAR_TURN_THRESHOLD = 3;
