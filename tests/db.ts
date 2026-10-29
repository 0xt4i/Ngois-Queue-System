import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

// Kết nối thẳng Postgres của `supabase start` để gọi các hàm pb_* (state machine).
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 20,
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function call<T = Json>(fn: string, ...args: unknown[]): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query(`select public.${fn}(${placeholders}) as r`, args);
  return rows[0].r as T;
}

export const token = () => randomBytes(24).toString("base64url");

/** Tạo 1 tiệm riêng cho mỗi test (cô lập dữ liệu) với mã ngày `1234`. */
export async function createShop(opts: { grace?: number; paused?: boolean } = {}) {
  const slug = `t-${randomUUID().slice(0, 12)}`;
  const { rows } = await pool.query(
    `insert into public.shops (slug, name, grace_turns, is_paused) values ($1, 'Test', $2, $3) returning id`,
    [slug, opts.grace ?? 2, opts.paused ?? false],
  );
  const shopId: string = rows[0].id;
  await call("pb_get_session", shopId, false);
  await pool.query(`update public.daily_sessions set checkin_code = '1234' where shop_id = $1`, [shopId]);
  return { shopId, slug };
}

let phoneSeq = 0;
export const phone = () => `09${String(10_000_000 + ((Date.now() + phoneSeq++) % 89_999_999)).padStart(8, "0")}`;

export function takeNumber(shopId: string, p: string | null = phone(), code = "1234") {
  return call("pb_create_ticket", shopId, code, "Khách", p, "QR", token());
}

export function staff(shopId: string, action: string, ticketId: string | null = null, idem: string | null = null) {
  return call("pb_staff_action", shopId, null, action, ticketId, idem);
}

/** { số: trạng thái } của phiên hiện tại */
export async function statuses(shopId: string): Promise<Record<number, string>> {
  const { rows } = await pool.query(
    `select number, status from public.tickets where shop_id = $1 order by number`,
    [shopId],
  );
  return Object.fromEntries(rows.map((r) => [r.number, r.status]));
}

export async function ticketId(shopId: string, number: number): Promise<string> {
  const { rows } = await pool.query(`select id from public.tickets where shop_id = $1 and number = $2`, [shopId, number]);
  return rows[0].id;
}
