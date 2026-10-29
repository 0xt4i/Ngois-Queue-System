import { afterAll, describe, expect, it } from "vitest";
import { call, createShop, phone, pool, staff, statuses, takeNumber, ticketId, token } from "./db";

afterAll(() => pool.end());

/** Tạo n vé, trả về shopId */
async function shopWith(n: number, opts?: { grace?: number }) {
  const { shopId } = await createShop(opts);
  for (let i = 0; i < n; i++) await takeNumber(shopId);
  return shopId;
}

describe("Lấy số", () => {
  it("cấp số tuần tự bắt đầu từ 1", async () => {
    const { shopId } = await createShop();
    const a = await takeNumber(shopId);
    const b = await takeNumber(shopId);
    expect(a.ok && b.ok).toBe(true);
    expect([a.ticket.number, b.ticket.number]).toEqual([1, 2]);
    expect(a.ticket.status).toBe("WAITING");
  });

  it("sai mã ngày → BAD_CODE, không tốn số", async () => {
    const { shopId } = await createShop();
    const bad = await takeNumber(shopId, phone(), "9999");
    expect(bad).toMatchObject({ ok: false, error: "BAD_CODE" });
    const ok = await takeNumber(shopId);
    expect(ok.ticket.number).toBe(1);
  });

  it("trùng SĐT → trả về vé cũ, không tạo mới", async () => {
    const { shopId } = await createShop();
    const p = phone();
    const first = await takeNumber(shopId, p);
    const again = await takeNumber(shopId, p);
    expect(again).toMatchObject({ ok: true, existing: true });
    expect(again.ticket.token).toBe(first.ticket.token);
    expect(Object.keys(await statuses(shopId))).toHaveLength(1);
  });

  it("SĐT đã chụp xong (DONE) được lấy số mới", async () => {
    const { shopId } = await createShop();
    const p = phone();
    await takeNumber(shopId, p);
    await staff(shopId, "NEXT");
    await staff(shopId, "NEXT"); // #1 DONE
    const again = await takeNumber(shopId, p);
    expect(again).toMatchObject({ ok: true, existing: false });
    expect(again.ticket.number).toBe(2);
  });

  it("tạm dừng → khách bị chặn (PAUSED), nhân viên vẫn thêm thủ công được", async () => {
    const { shopId } = await createShop();
    await call("pb_set_paused", shopId, null, true);
    expect(await takeNumber(shopId)).toMatchObject({ ok: false, error: "PAUSED" });
    const manual = await call("pb_create_ticket", shopId, null, "Bà Tư", null, "MANUAL", token());
    expect(manual).toMatchObject({ ok: true });
    expect(manual.ticket.number).toBe(1);
    await call("pb_set_paused", shopId, null, false);
    expect((await takeNumber(shopId)).ticket.number).toBe(2);
  });
});

describe("Next / Vắng mặt", () => {
  it("Next: SERVING → DONE, WAITING nhỏ nhất → SERVING", async () => {
    const shopId = await shopWith(3);
    const r1 = await staff(shopId, "NEXT");
    expect(r1.servedNumber).toBe(1);
    expect(await statuses(shopId)).toEqual({ 1: "SERVING", 2: "WAITING", 3: "WAITING" });
    const r2 = await staff(shopId, "NEXT");
    expect(r2.servedNumber).toBe(2);
    expect(await statuses(shopId)).toEqual({ 1: "DONE", 2: "SERVING", 3: "WAITING" });
    expect(r2.state.currentNumber).toBe(2);
    expect(r2.state.queue).toEqual([3]);
  });

  it("Next khi hết khách: vé cuối DONE, không còn ai SERVING; lần sau báo EMPTY", async () => {
    const shopId = await shopWith(1);
    await staff(shopId, "NEXT");
    const r = await staff(shopId, "NEXT");
    expect(r.ok).toBe(true);
    expect(r.state.currentNumber).toBeNull();
    expect(await staff(shopId, "NEXT")).toMatchObject({ ok: false, error: "EMPTY" });
  });

  it("Vắng mặt: SERVING → SKIPPED và tự gọi số kế tiếp", async () => {
    const shopId = await shopWith(3);
    await staff(shopId, "NEXT"); // #1 serving
    const r = await staff(shopId, "SKIP");
    expect(r.servedNumber).toBe(2);
    expect(await statuses(shopId)).toEqual({ 1: "SKIPPED", 2: "SERVING", 3: "WAITING" });
    expect(r.state.skippedInGrace).toEqual([{ number: 1, turnsLeft: 1, recalled: false }]);
  });

  it("Vắng mặt khi không có ai đang chụp → NO_SERVING", async () => {
    const shopId = await shopWith(1);
    expect(await staff(shopId, "SKIP")).toMatchObject({ ok: false, error: "NO_SERVING" });
  });
});

describe("Ân hạn (GRACE_TURNS = 2)", () => {
  it("SKIPPED chuyển EXPIRED đúng sau lượt thứ GRACE_TURNS + 1", async () => {
    const shopId = await shopWith(6);
    await staff(shopId, "NEXT"); // #1
    await staff(shopId, "SKIP"); // #1 skipped, #2 served → lượt 1 sau skip
    expect((await statuses(shopId))[1]).toBe("SKIPPED");
    await staff(shopId, "NEXT"); // #3 → lượt 2
    expect((await statuses(shopId))[1]).toBe("SKIPPED");
    await staff(shopId, "NEXT"); // #4 → lượt 3 = GRACE + 1
    expect((await statuses(shopId))[1]).toBe("EXPIRED");
  });

  it("GRACE_TURNS = 0 → hết hạn ngay ở lượt kế tiếp", async () => {
    const shopId = await shopWith(3, { grace: 0 });
    await staff(shopId, "NEXT");
    await staff(shopId, "SKIP");
    expect((await statuses(shopId))[1]).toBe("EXPIRED");
  });

  it("Gọi lại trong ân hạn: chèn làm lượt kế tiếp, không ngắt lượt đang chụp", async () => {
    const shopId = await shopWith(5);
    await staff(shopId, "NEXT"); // #1
    await staff(shopId, "SKIP"); // #2 serving, #1 skipped
    await staff(shopId, "NEXT"); // #3 serving (lượt 2 sau skip)
    const r = await staff(shopId, "RECALL", await ticketId(shopId, 1));
    expect(r.ok).toBe(true);
    expect(r.state.currentNumber).toBe(3); // không ngắt
    expect(r.state.queue).toEqual([1, 4, 5]); // #1 đứng đầu hàng
    const n = await staff(shopId, "NEXT");
    expect(n.servedNumber).toBe(1);
    expect(await statuses(shopId)).toMatchObject({ 1: "SERVING", 3: "DONE", 4: "WAITING" });
  });

  it("Vé đã gọi lại không bị EXPIRED dù qua thêm lượt", async () => {
    const shopId = await shopWith(5);
    await staff(shopId, "NEXT");
    await staff(shopId, "SKIP"); // #2 serving
    await staff(shopId, "RECALL", await ticketId(shopId, 1));
    await staff(shopId, "NEXT"); // #1 serving
    expect((await statuses(shopId))[1]).toBe("SERVING");
  });

  it("Gọi lại khi không ai đang chụp → được gọi vào chụp ngay", async () => {
    const shopId = await shopWith(1);
    await staff(shopId, "NEXT");
    await staff(shopId, "SKIP"); // không còn ai, #1 skipped
    const r = await staff(shopId, "RECALL", await ticketId(shopId, 1));
    expect(r.servedNumber).toBe(1);
    expect(r.state.currentNumber).toBe(1);
  });

  it("Gọi lại ngoài ân hạn → NOT_RECALLABLE", async () => {
    const shopId = await shopWith(6);
    await staff(shopId, "NEXT");
    await staff(shopId, "SKIP");
    await staff(shopId, "NEXT");
    await staff(shopId, "NEXT"); // #1 expired
    expect(await staff(shopId, "RECALL", await ticketId(shopId, 1))).toMatchObject({
      ok: false,
      error: "NOT_RECALLABLE",
    });
  });
});

describe("Hoàn tác", () => {
  it("Hoàn tác Next khôi phục đúng trạng thái trước", async () => {
    const shopId = await shopWith(3);
    await staff(shopId, "NEXT");
    const before = await statuses(shopId);
    await staff(shopId, "NEXT");
    const u = await staff(shopId, "UNDO");
    expect(u.ok).toBe(true);
    expect(await statuses(shopId)).toEqual(before);
    expect(u.state.currentNumber).toBe(1);
    expect(u.state.queue).toEqual([2, 3]);
  });

  it("Hoàn tác Vắng mặt, kể cả vé đã bị EXPIRED theo", async () => {
    const shopId = await shopWith(5);
    await staff(shopId, "NEXT");
    await staff(shopId, "SKIP");
    await staff(shopId, "NEXT");
    const before = await statuses(shopId);
    await staff(shopId, "SKIP"); // #3 skipped, #4 served → #1 expired
    expect((await statuses(shopId))[1]).toBe("EXPIRED");
    await staff(shopId, "UNDO");
    expect(await statuses(shopId)).toEqual(before);
    // serve_count cũng được khôi phục → #1 vẫn còn đúng 0 lượt ân hạn
    const s = await call("pb_public_state", shopId);
    expect(s.skippedInGrace).toEqual([{ number: 1, turnsLeft: 0, recalled: false }]);
  });

  it("Hoàn tác Gọi lại", async () => {
    const shopId = await shopWith(3);
    await staff(shopId, "NEXT");
    await staff(shopId, "SKIP");
    await staff(shopId, "RECALL", await ticketId(shopId, 1));
    await staff(shopId, "UNDO");
    const s = await call("pb_public_state", shopId);
    expect(s.queue).toEqual([3]);
    expect(s.skippedInGrace[0]).toMatchObject({ number: 1, recalled: false });
  });

  it("Chỉ hoàn tác được thao tác gần nhất, 1 lần", async () => {
    const shopId = await shopWith(3);
    await staff(shopId, "NEXT");
    await staff(shopId, "NEXT");
    expect((await staff(shopId, "UNDO")).ok).toBe(true);
    expect(await staff(shopId, "UNDO")).toMatchObject({ ok: false, error: "NOTHING_TO_UNDO" });
  });

  it("Quá 60 giây thì không hoàn tác được", async () => {
    const shopId = await shopWith(2);
    await staff(shopId, "NEXT");
    await pool.query(`update public.audit_logs set created_at = now() - interval '61 seconds' where shop_id = $1`, [shopId]);
    expect(await staff(shopId, "UNDO")).toMatchObject({ ok: false, error: "NOTHING_TO_UNDO" });
  });

  it("Thao tác khác chen giữa (huỷ vé) → không hoàn tác thao tác cũ", async () => {
    const shopId = await shopWith(3);
    await staff(shopId, "NEXT");
    await staff(shopId, "CANCEL", await ticketId(shopId, 3));
    expect(await staff(shopId, "UNDO")).toMatchObject({ ok: false, error: "NOTHING_TO_UNDO" });
  });
});

describe("Idempotency", () => {
  it("Cùng Idempotency-Key gửi 2 lần chỉ thực hiện 1 lần", async () => {
    const shopId = await shopWith(3);
    const a = await staff(shopId, "NEXT", null, "key-1");
    const b = await staff(shopId, "NEXT", null, "key-1");
    expect(b.replayed).toBe(true);
    expect(b.servedNumber).toBe(a.servedNumber);
    expect(await statuses(shopId)).toEqual({ 1: "SERVING", 2: "WAITING", 3: "WAITING" });
  });

  it("Double-click song song cùng key → vẫn 1 lần", async () => {
    const shopId = await shopWith(3);
    await Promise.all([staff(shopId, "NEXT", null, "dbl"), staff(shopId, "NEXT", null, "dbl")]);
    expect(await statuses(shopId)).toEqual({ 1: "SERVING", 2: "WAITING", 3: "WAITING" });
  });
});

describe("Huỷ vé", () => {
  it("Khách tự huỷ vé đang chờ", async () => {
    const { shopId } = await createShop();
    const t = await takeNumber(shopId);
    const r = await call("pb_customer_cancel", t.ticket.token);
    expect(r).toMatchObject({ ok: true, ticket: { status: "CANCELLED" } });
    expect(await call("pb_customer_cancel", t.ticket.token)).toMatchObject({ ok: false, error: "INVALID_STATE" });
  });

  it("Không huỷ được vé đang chụp", async () => {
    const { shopId } = await createShop();
    const t = await takeNumber(shopId);
    await staff(shopId, "NEXT");
    expect(await call("pb_customer_cancel", t.ticket.token)).toMatchObject({ ok: false });
  });
});

describe("Reset ngày", () => {
  it("Ngày làm việc mới → số bắt đầu lại từ 1, vé cũ hết hiệu lực", async () => {
    const shopId = await shopWith(3);
    const { rows } = await pool.query(`select token from public.tickets where shop_id = $1 and number = 3`, [shopId]);
    // Giả lập: phiên hiện tại thuộc về hôm qua
    await pool.query(
      `update public.daily_sessions set business_date = business_date - 1 where shop_id = $1`,
      [shopId],
    );
    await pool.query(`update public.tickets set business_date = business_date - 1 where shop_id = $1`, [shopId]);
    // Ngày mới: mã ngày (chế độ AUTO) được sinh mới → mã cũ không dùng được nữa
    const display = await call("pb_display_state", shopId);
    expect(display.state.queue).toEqual([]);
    if (display.checkinCode !== "1234") {
      expect(await takeNumber(shopId)).toMatchObject({ ok: false, error: "BAD_CODE" });
    }
    const fresh = await takeNumber(shopId, phone(), display.checkinCode);
    expect(fresh.ticket.number).toBe(1);
    const old = await call("pb_ticket_view", rows[0].token);
    expect(old.ticket.isToday).toBe(false);
    expect(old.state.queue).toEqual([1]);
    expect(old.state.currentNumber).toBeNull();
  });
});

describe("Snapshot công khai", () => {
  it("Không chứa tên, SĐT, mã ngày; version tăng dần", async () => {
    const { shopId } = await createShop();
    const p = phone();
    const a = await takeNumber(shopId, p);
    const s1 = await call("pb_public_state", shopId);
    await staff(shopId, "NEXT");
    const s2 = await call("pb_public_state", shopId);
    const text = JSON.stringify(s2);
    expect(text).not.toContain(p);
    expect(text).not.toContain("Khách");
    expect(text).not.toContain("1234");
    expect(text).not.toContain(a.ticket.token);
    expect(s2.version).toBeGreaterThan(s1.version);
  });
});

describe("Rate limit", () => {
  it("Đếm theo cửa sổ thời gian", async () => {
    const key = `test:${token()}`;
    expect(await call<number>("pb_rate_hit", key, 600, 1)).toBe(1);
    expect(await call<number>("pb_rate_hit", key, 600, 1)).toBe(2);
    expect(await call<number>("pb_rate_hit", key, 600, 0)).toBe(2);
    await pool.query(`update public.rate_limits set window_start = now() - interval '11 minutes' where key = $1`, [key]);
    expect(await call<number>("pb_rate_hit", key, 600, 1)).toBe(1);
  });
});
