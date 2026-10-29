import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});

let shop: { id: string; slug: string; displayKey: string; username: string };

test.beforeAll(async () => {
  // Tiệm riêng cho test, không đụng dữ liệu demo
  const suffix = randomUUID().slice(0, 8);
  const slug = `e2e-${suffix}`;
  const displayKey = `dk-${suffix}`;
  const { rows } = await pool.query(
    `insert into public.shops (slug, name, display_key) values ($1, 'E2E Booth', $2) returning id`,
    [slug, displayKey],
  );
  const id = rows[0].id as string;
  const username = `e2e.${suffix}`;
  await pool.query(
    `insert into public.staff_users (shop_id, username, password_hash, role) values ($1, $2, $3, 'STAFF')`,
    [id, username, await bcrypt.hash("e2e-pass", 10)],
  );
  await pool.query(`select public.pb_get_session($1, false)`, [id]);
  await pool.query(`update public.daily_sessions set checkin_code = '4321' where shop_id = $1`, [id]);
  shop = { id, slug, displayKey, username };
});

test.afterAll(async () => {
  await pool.query(`delete from public.shops where id = $1`, [shop.id]);
  await pool.end();
});

test("khách lấy số → nhân viên bấm Next → trang khách & màn hình tiệm cập nhật < 2s", async ({ browser }) => {
  const customerCtx = await browser.newContext({ ...{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
  const staffCtx = await browser.newContext();
  const displayCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const customer = await customerCtx.newPage();
  const staffPage = await staffCtx.newPage();
  const display = await displayCtx.newPage();

  // 1) Màn hình tiệm
  await display.goto(`/display/${shop.slug}?key=${shop.displayKey}`);
  await expect(display.getByTestId("display-code")).toHaveText("4321");
  await expect(display.getByTestId("display-current")).toHaveText("—");

  // 2) Khách lấy số (sai mã trước)
  await customer.goto(`/s/${shop.slug}`);
  await customer.getByLabel("Mã ngày (4 số)").fill("1111");
  await customer.getByLabel("Tên của bạn").fill("Khách E2E");
  await customer.getByLabel("Số điện thoại").fill("0909000111");
  await customer.getByRole("button", { name: "Nhận số" }).click();
  await expect(customer.getByText("Mã không đúng, vui lòng xem mã trên màn hình tại quầy.")).toBeVisible();
  await customer.getByLabel("Mã ngày (4 số)").fill("4321");
  await customer.getByRole("button", { name: "Nhận số" }).click();
  await customer.waitForURL(/\/t\//);
  await expect(customer.getByTestId("my-number")).toHaveText("1");

  // Khách thứ 2 lấy số qua API → khách 1 vẫn là lượt kế tiếp
  await pool.query(
    `select public.pb_create_ticket($1, '4321', 'Khách 2', '0909000222', 'QR', $2)`,
    [shop.id, `tok-${randomUUID()}`],
  );

  // 3) Nhân viên đăng nhập
  await staffPage.goto("/staff/login");
  await staffPage.getByLabel("Tên đăng nhập").fill(shop.username);
  await staffPage.getByLabel("Mật khẩu").fill("e2e-pass");
  await staffPage.getByRole("button", { name: "Đăng nhập" }).click();
  await staffPage.waitForURL("**/staff");
  await expect(staffPage.getByTestId("waiting-list")).toContainText("Khách E2E");

  // Chờ cả 2 trang đã kết nối realtime
  await expect(customer.getByText("Đang cập nhật trực tiếp")).toBeVisible({ timeout: 10_000 });
  await expect(display.locator("span.bg-emerald-500")).toBeVisible({ timeout: 10_000 });

  // 4) Next → số 1 vào chụp
  await staffPage.getByTestId("btn-next").click();
  const t0 = Date.now();
  await Promise.all([
    expect(customer.getByTestId("banner-serving")).toBeVisible({ timeout: 2_000 }),
    expect(display.getByTestId("display-current")).toHaveText("1", { timeout: 2_000 }),
  ]);
  const elapsed = Date.now() - t0;
  console.log(`Realtime cập nhật sau ${elapsed}ms`);
  expect(elapsed).toBeLessThan(2_000);
  await expect(staffPage.getByTestId("staff-current")).toHaveText("1");

  // 5) Next lần nữa → số 2, khách 1 thấy đã chụp xong
  await staffPage.getByTestId("btn-next").click();
  await expect(display.getByTestId("display-current")).toHaveText("2", { timeout: 2_000 });
  await expect(customer.getByText(/Cảm ơn bạn đã chụp ảnh/)).toBeVisible({ timeout: 3_000 });

  // 6) Khách mở lại link gốc → vé đã xong nên hiện form lấy số mới
  await customer.goto(`/s/${shop.slug}`);
  await expect(customer.getByRole("button", { name: "Nhận số" })).toBeVisible();

  await Promise.all([customerCtx.close(), staffCtx.close(), displayCtx.close()]);
});
