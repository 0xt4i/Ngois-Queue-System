import { afterAll, expect, it } from "vitest";
import { call, createShop, pool, takeNumber, token } from "./db";

afterAll(() => pool.end());

it("50 vé thủ công song song → số 1..50, không trùng, không thiếu", async () => {
  const { shopId } = await createShop();
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      call("pb_create_ticket", shopId, null, `Khách ${i}`, null, "MANUAL", token()),
    ),
  );
  expect(results.every((r) => r.ok && !r.existing)).toBe(true);
  const numbers = results.map((r) => r.ticket.number as number).sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

  const { rows } = await pool.query(`select last_number from public.daily_sessions where shop_id = $1`, [shopId]);
  expect(rows[0].last_number).toBe(50);
});

it("Cùng 1 SĐT gửi 10 lần song song → chỉ 1 vé", async () => {
  const { shopId } = await createShop();
  const first = await takeNumber(shopId, "0987654321");
  const results = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const { rows } = await pool.query(`select checkin_code from public.daily_sessions where shop_id = $1`, [shopId]);
      return takeNumber(shopId, "0987654321", rows[0].checkin_code);
    }),
  );
  expect(new Set([first.ticket.number, ...results.filter((r) => r.ok).map((r) => r.ticket.number)])).toEqual(new Set([1]));
  expect(results.filter((r) => r.ok && r.existing)).toHaveLength(10);
});
