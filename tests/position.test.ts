import { describe, expect, it } from "vitest";
import { derivePosition, estimateWaitSeconds } from "@/lib/position";
import type { QueueSnapshot } from "@/lib/types";
import { normalizePhone, phoneSchema } from "@/lib/validation";

const snap = (p: Partial<QueueSnapshot>): QueueSnapshot => ({
  shopId: "s",
  businessDate: "2026-10-29",
  currentNumber: 2,
  currentCalledAt: null,
  queue: [],
  nextNumbers: [],
  skippedInGrace: [],
  waitingCount: 0,
  avgServiceSeconds: 600,
  avgFromData: false,
  isPaused: false,
  graceTurns: 2,
  serveCount: 2,
  version: 1,
  updatedAt: "",
  ...p,
});

describe("derivePosition (quy tắc 8)", () => {
  it("Ví dụ chủ tiệm: đang chụp số 2, mình số 10 → còn 8 lượt", () => {
    const s = snap({ currentNumber: 2, queue: [3, 4, 5, 6, 7, 8, 9, 10] });
    expect(derivePosition(s, 10)).toEqual({ status: "WAITING", ahead: 8, recalled: false });
  });

  it("Tính cả vé được gọi lại đứng trước", () => {
    const s = snap({
      currentNumber: 5,
      queue: [3, 6, 7],
      skippedInGrace: [{ number: 3, turnsLeft: 1, recalled: true }],
    });
    expect(derivePosition(s, 7)).toMatchObject({ ahead: 3 });
    expect(derivePosition(s, 3)).toEqual({ status: "WAITING", ahead: 1, recalled: true });
  });

  it("Không có ai đang chụp → không cộng 1", () => {
    expect(derivePosition(snap({ currentNumber: null, queue: [4, 5] }), 4)).toMatchObject({ ahead: 0 });
  });

  it("SERVING / SKIPPED / UNKNOWN", () => {
    const s = snap({ currentNumber: 2, skippedInGrace: [{ number: 1, turnsLeft: 2, recalled: false }] });
    expect(derivePosition(s, 2)).toEqual({ status: "SERVING" });
    expect(derivePosition(s, 1)).toEqual({ status: "SKIPPED", turnsLeft: 2 });
    expect(derivePosition(s, 99)).toEqual({ status: "UNKNOWN" });
  });

  it("Ước lượng thời gian = lượt phía trước × TB", () => {
    expect(estimateWaitSeconds(3, snap({ avgServiceSeconds: 420 }))).toBe(1260);
  });
});

describe("SĐT Việt Nam", () => {
  it("chuẩn hoá +84 / khoảng trắng", () => {
    expect(normalizePhone("+84 901 234 567")).toBe("0901234567");
    expect(normalizePhone("84901234567")).toBe("0901234567");
    expect(phoneSchema.safeParse("0901.234.567").success).toBe(true);
    expect(phoneSchema.safeParse("123456").success).toBe(false);
    expect(phoneSchema.safeParse("1901234567").success).toBe(false);
  });
});
