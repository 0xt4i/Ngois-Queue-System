import { afterAll, expect, it } from "vitest";
import { createShop, pool, takeNumber } from "./db";

afterAll(() => pool.end());

it("50 request lấy số song song → số 1..50, không trùng, không thiếu", async () => {
  const { shopId } = await createShop();
  const results = await Promise.all(Array.from({ length: 50 }, () => takeNumber(shopId)));
  expect(results.every((r) => r.ok && !r.existing)).toBe(true);
  const numbers = results.map((r) => r.ticket.number as number).sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

  const { rows } = await pool.query(`select last_number from public.daily_sessions where shop_id = $1`, [shopId]);
  expect(rows[0].last_number).toBe(50);
});

it("Cùng 1 SĐT gửi 10 lần song song → chỉ 1 vé", async () => {
  const { shopId } = await createShop();
  const results = await Promise.all(Array.from({ length: 10 }, () => takeNumber(shopId, "0987654321")));
  expect(new Set(results.map((r) => r.ticket.number)).size).toBe(1);
  expect(results.filter((r) => !r.existing)).toHaveLength(1);
});
