# Hệ thống bốc số Photobooth

Một web app duy nhất cho tiệm photobooth, gồm 3 giao diện dùng chung dữ liệu realtime:

| Giao diện | Đường dẫn | Ai dùng |
|---|---|---|
| Trang khách | `/s/{slug}` (và `/` chuyển về tiệm mặc định) → `/t/{token}` | Khách, trên điện thoại. **Một link** để vừa lấy số vừa xem đang tới lượt mấy |
| Quầy nhân viên | `/staff` (cài đặt: `/staff/settings`, in QR: `/staff/print`) | Nhân viên / chủ tiệm |
| Màn hình tiệm | `/display/{slug}?key=…` | TV treo ở tiệm |

**Công nghệ:** Next.js 16 (App Router, TypeScript strict) + Tailwind, chạy trên **Vercel**. Database **Supabase** (Postgres 17), realtime bằng **Supabase Realtime**.

---

## 1. Kiến trúc

```
Điện thoại khách ─┐                                   ┌─ Supabase Postgres
Quầy nhân viên ───┼─ HTTPS ─▶ Vercel (Next.js API) ──▶│   hàm pb_* = state machine
Màn hình TV ──────┘                                   │   bảng queue_state (snapshot công khai)
        ▲                                             └─ Supabase Realtime
        └──────────── WebSocket (chỉ đọc queue_state) ◀──┘
```

- **Toàn bộ nghiệp vụ hàng đợi nằm trong các hàm Postgres** (`supabase/migrations/…_init.sql`): `pb_create_ticket`, `pb_staff_action` (Next / Vắng mặt / Gọi lại / Huỷ / Hoàn tác), `pb_set_code`, `pb_set_paused`… Mỗi hàm chạy trong 1 transaction và khoá dòng `daily_sessions` (`FOR UPDATE`), nên **cấp số luôn tuần tự, không trùng, không nhảy số**, kể cả khi nhiều khách bấm cùng lúc.
- Sau mỗi thay đổi, hàm `pb_refresh_state` ghi lại **snapshot công khai** vào bảng `queue_state` (số đang chụp, thứ tự hàng chờ, số gọi lỡ, thời gian chụp TB, `version`…). Snapshot này **không chứa tên, SĐT hay mã ngày**.
- Trình duyệt subscribe `queue_state` qua Supabase Realtime (kênh `shop:{shopId}`), dùng khoá anon và RLS chỉ cho đọc đúng bảng này. Khách **tự tính "còn bao nhiêu lượt"** từ snapshot + số của mình.
- Dự phòng: nếu realtime rớt thì polling 15 giây, khi đang kết nối thì vẫn poll 60 giây/lần. Mở lại tab hoặc có mạng lại thì tải ngay. Client bỏ qua snapshot có `version` cũ hơn bản đang có.
- Next.js API chỉ dùng **service role key phía server**. Mọi bảng khác bật RLS và không cấp quyền cho anon.

```
src/
  app/            trang + API routes (api/shops, api/tickets, api/staff/…)
  components/     ui/ (kiểu shadcn), customer/, staff/, display/
  lib/            db, auth, rate-limit, validation (zod), position, use-queue-state (realtime)…
supabase/
  migrations/     schema + state machine (SQL)
  seed.sql        dữ liệu demo
tests/            vitest: state machine, đồng thời, logic vị trí
e2e/              Playwright: luồng khách → nhân viên → màn hình
```

---

## 2. Chạy trên máy (local)

Yêu cầu: Node 20+, Docker Desktop (cho Supabase local).

```bash
npm install
npx supabase start          # chạy Postgres + Realtime + API local (lần đầu tải image hơi lâu)
npx supabase db reset       # tạo schema + nạp dữ liệu demo
npx supabase status -o env  # lấy ANON_KEY, SERVICE_ROLE_KEY
cp .env.example .env.local  # điền 2 khoá trên + NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
npm run dev                 # http://localhost:3000
```

Dữ liệu demo:

| | |
|---|---|
| Trang khách | http://localhost:3000 → `/s/demo-photobooth`, **mã ngày `1234`** |
| Nhân viên | http://localhost:3000/staff (tài khoản `owner` / `owner123` (chủ tiệm), `staff` / `staff123`) |
| Màn hình tiệm | http://localhost:3000/display/demo-photobooth?key=demo-display-key |
| Vé mẫu | 12 vé: 1–4, 6 đã chụp · 5 mất lượt · 7 gọi lỡ (còn ân hạn) · 8 đang chụp · 9 đã huỷ · 10–12 đang chờ. Mở thử `/t/demo-token-12` |

### Kiểm thử

```bash
npm test             # 36 test: state machine, ân hạn, hoàn tác, idempotency, trùng SĐT, tạm dừng,
                     # reset ngày, 50 request lấy số song song → số 1..50
npm run build && npx playwright install chromium && npm run test:e2e
                     # khách lấy số → nhân viên Next → trang khách & TV cập nhật < 2s
```
Cả hai bộ test cần `npx supabase start` đang chạy. Test tự tạo tiệm riêng nên không đụng dữ liệu demo.

---

## 3. Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✔ | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✔ | Khoá **anon** (công khai). Chỉ dùng để nhận realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | ✔ | Khoá **service_role**. **Bí mật**, chỉ đặt trên Vercel, không đưa vào code |
| `NEXT_PUBLIC_DEFAULT_SHOP_SLUG` | | Tiệm mở khi vào `/` (mặc định `demo-photobooth`) |
| `NEXT_PUBLIC_APP_URL` | | URL công khai (vd `https://bocso.tiem.vn`), dùng in vào QR. Bỏ trống thì lấy theo domain đang truy cập |
| `LOG_LEVEL` | | `info` (mặc định production) / `debug` |
| `DATABASE_URL_TEST` | | Chỉ dùng khi chạy test local |

---

## 4. Triển khai: Supabase + Vercel

### 4.1 Supabase
1. Tạo project tại supabase.com, chọn **region Singapore (ap-southeast-1)** cho gần Việt Nam.
2. Đẩy schema lên:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
3. Tạo tiệm + tài khoản chủ tiệm: mở **SQL Editor** và chạy (sửa tên/slug/mật khẩu):
   ```sql
   with s as (
     insert into public.shops (slug, name) values ('ten-tiem', 'Tên Tiệm Photobooth') returning id
   )
   insert into public.staff_users (shop_id, username, display_name, password_hash, role)
   select id, 'owner', 'Chủ tiệm', extensions.crypt('MAT-KHAU-MANH', extensions.gen_salt('bf', 10)), 'OWNER' from s;
   ```
   (Muốn có dữ liệu demo thì chạy nội dung `supabase/seed.sql` thay cho bước này.)
4. Vào **Project Settings → API** để lấy URL, khoá `anon` và khoá `service_role`.

### 4.2 Vercel
1. Đẩy code lên GitHub, rồi **Import Project** trên Vercel (Framework: Next.js, giữ mặc định).
2. Thêm các biến môi trường ở mục 3 (Production + Preview), đặt `NEXT_PUBLIC_DEFAULT_SHOP_SLUG` = slug tiệm vừa tạo.
3. Deploy. `vercel.json` đã đặt function ở **Singapore (`sin1`)** cho cùng vùng với database.
4. (Tuỳ chọn) gắn domain riêng ở **Settings → Domains**. Vercel tự cấp HTTPS, không cần Nginx hay Let's Encrypt.
5. Sau khi deploy: đăng nhập `/staff`, vào **Cài đặt** để chỉnh tên, màu, logo, số lượt ân hạn… và **đổi mật khẩu**.

> ⚠️ **Về gói dịch vụ:**
> - **Vercel Hobby (miễn phí) không cho dùng cho mục đích thương mại.** Tiệm kinh doanh nên dùng gói **Pro**.
> - **Supabase Free** giới hạn **200 kết nối realtime đồng thời** và tự tạm dừng project nếu 7 ngày không có truy cập. Nếu số người mở trang cùng lúc vượt giới hạn, các trang vẫn chạy nhờ polling 15 giây, chỉ chậm hơn. Muốn chắc chắn thì dùng **Pro**.

---

## 5. In QR & cài màn hình TV

**In QR tại quầy:** vào **Cài đặt → In QR khổ A5** (hoặc `/staff/print`), bấm in, chọn khổ A5. Tờ in gồm logo, QR tới trang khách và 3 bước *Quét mã → Nhập mã ngày trên màn hình → Nhận số*. QR là link cố định, không cần in lại khi đổi mã ngày.

**Màn hình TV:**
1. Lấy **Link màn hình tiệm** trong **Cài đặt**. Link này có `key` bí mật, đừng chia sẻ.
2. Mở link bằng Chrome trên Smart TV / Android box / mini PC, bấm nút ⛶ để toàn màn hình (hoặc F11).
3. **Chạm/bấm vào màn hình 1 lần** để trình duyệt cho phép phát âm "ting" khi đổi số. Nút 🔊 dùng để bật/tắt.
4. Màn hình tự chống tắt (Wake Lock, nếu trình duyệt hỗ trợ; TV có chế độ tiết kiệm điện riêng thì tắt nó đi). Nếu mất kết nối quá 30 giây, trang tự tải lại khi có mạng.
5. Nghi lộ link thì bấm **Tạo khoá màn hình mới** (link cũ hết hiệu lực) rồi mở link mới trên TV.

---

## 6. Nghiệp vụ & giả định đã chọn

- **Ngày làm việc** tính theo múi giờ tiệm (`Asia/Ho_Chi_Minh`) và **giờ reset** (mặc định 00:00). Sau giờ reset, số bắt đầu lại từ 1. Không cần cron: phiên ngày mới được tạo ở request đầu tiên.
- **Mã ngày:** chế độ *Tự sinh* tạo mã mới mỗi ngày. Chế độ *Nhân viên tự đặt* giữ mã cũ qua ngày cho tới khi nhân viên đổi. "Tự đổi mã mỗi N giờ" được kiểm tra mỗi khi có truy cập, và màn hình TV hỏi lại mỗi 60 giây nên mã luôn mới.
- **Ân hạn (mặc định 2 lượt):** bị gọi lỡ ở lượt k thì còn được "Gọi lại" khi chưa có quá 2 vé khác được gọi vào chụp. Đến vé thứ 3 thì tự chuyển **Mất lượt**. Không có người chụp thì không tính lượt.
- **Gọi lại:** vé được chèn làm lượt kế tiếp, không ngắt lượt đang chụp. Nếu lúc đó không ai đang chụp thì được gọi vào ngay. Vé đã gọi lại mà lại vắng thì được thêm một lần ân hạn nữa (nhân viên tự quyết).
- **Hoàn tác:** chỉ áp dụng cho thao tác Next / Vắng mặt / Gọi lại **gần nhất**, trong 60 giây, và chỉ khi sau đó chưa có thao tác nào khác thay đổi hàng (huỷ vé…). Không hoàn tác được việc huỷ vé.
- **Trùng SĐT:** khi SĐT đã có vé đang chờ, đang chụp hoặc gọi lỡ trong ngày, hệ thống trả lại vé cũ. Vé đã chụp xong, mất lượt hoặc đã huỷ thì được lấy số mới. Lưu ý: ai biết SĐT **và** đang ở tiệm (biết mã ngày) thì mở được vé đó. Đây là đánh đổi để có tính năng "tra cứu bằng SĐT" theo yêu cầu.
- **Khách chỉ huỷ được** vé đang chờ hoặc gọi lỡ, không huỷ được vé đang chụp.
- **Tạm dừng nhận số:** chặn khách tự lấy số, nhưng nhân viên vẫn thêm khách thủ công được.
- **Thêm khách thủ công:** không cần mã ngày, SĐT tuỳ chọn. Màn hình hiện số to kèm QR để khách theo dõi nếu muốn. Chưa hỗ trợ máy in bill nhiệt.
- **Ước lượng thời gian chờ** = số lượt phía trước × thời gian chụp TB hôm nay. Chỉ tính các lượt từ 30 giây tới 3 giờ, và cần ít nhất 2 lượt đã xong; chưa đủ dữ liệu thì dùng giá trị mặc định trong Cài đặt (10 phút).
- **Rate limit** lưu trong Postgres (dùng chung cho mọi serverless instance): sai mã ngày 5 lần / 10 phút / IP + thiết bị, 30 lần / 10 phút / IP; lấy số và tra cứu 60 lần / 10 phút / IP (wifi tiệm thường dùng chung IP); đăng nhập sai 10 lần / 10 phút.
- **Bảo mật:** token vé 192-bit; mật khẩu bcrypt; session cookie `httpOnly`, `SameSite=Lax`, `Secure`, chỉ lưu hash của token; CSRF chặn bằng kiểm tra `Origin`; header CSP, X-Frame-Options, nosniff. SĐT tự xoá sau 30 ngày (cấu hình được).
- **Đa tiệm:** mọi bảng có `shop_id`, username nhân viên là duy nhất toàn hệ thống. Tickets có sẵn `station_id` (để trống) cho bản nhiều phòng chụp.

---

## 7. Checklist đối chiếu yêu cầu

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| Một app, 3 giao diện, dùng chung dữ liệu realtime | ✅ Đã làm | |
| Khách chỉ dùng 1 link: lấy số + xem đang chụp số mấy | ✅ Đã làm | `/s/{slug}` hiện cả số đang chụp; sau khi lấy số chuyển sang `/t/{token}` |
| Mã ngày 4 số, bắt có mặt tại tiệm | ✅ Đã làm | Hiện trên TV và quầy nhân viên |
| State machine WAITING/SERVING/DONE/SKIPPED/EXPIRED/CANCELLED | ✅ Đã làm | Hàm Postgres, có test |
| Cấp số tuần tự an toàn đồng thời, unique `(shop_id, business_date, number)` | ✅ Đã làm | Test 50 request song song |
| Next / Vắng mặt / Gọi lại / ân hạn / EXPIRED không cần cron | ✅ Đã làm | |
| Hoàn tác 60 giây | ✅ Đã làm | |
| 1 SĐT tối đa 1 vé hiệu lực/ngày, trả vé cũ | ✅ Đã làm | Có thêm unique index một phần làm chốt chặn |
| Số lượt phía trước (quy tắc 8) | ✅ Đã làm | |
| Trang khách: form, validate SĐT VN, lỗi thân thiện, giới hạn sai mã | ✅ Đã làm | |
| Trang vé: số to, đang chụp, còn N lượt, ước lượng, banner theo trạng thái, rung | ✅ Đã làm | |
| Realtime, "Cập nhật lúc", chấm xanh/đỏ, tự kết nối lại, visibilitychange | ✅ Đã làm | |
| Lưu vé (link + localStorage), tra cứu bằng SĐT, huỷ số | ✅ Đã làm | |
| Nhân viên: đăng nhập, vai trò OWNER/STAFF | ✅ Đã làm | |
| Nút NEXT / VẮNG MẶT / HOÀN TÁC, đồng hồ, phím tắt, chống double-click + Idempotency-Key | ✅ Đã làm | |
| Danh sách chờ, gọi lỡ (GỌI LẠI), mất lượt làm mờ, thêm thủ công | ✅ Đã làm | Thêm thủ công chỉ hiện số + QR, chưa in bill |
| Đổi mã (ngẫu nhiên hoặc tự đặt), tạm dừng / mở lại | ✅ Đã làm | |
| Thống kê hôm nay, audit log mọi thao tác | ✅ Đã làm | Audit log xem trong Supabase (bảng `audit_logs`), chưa có giao diện xem |
| Màn hình TV: số cực lớn, số tiếp theo, gọi lỡ, QR + mã ngày, nhấp nháy + ting, Wake Lock, tự reload | ✅ Đã làm | |
| Cài đặt: tên, logo (URL), màu, slug, ân hạn, giờ reset, chế độ mã, tự đổi mã | ✅ Đã làm | Logo nhập bằng URL, chưa có upload |
| Quản lý tài khoản, in QR A5, xuất CSV | ✅ Đã làm | CSV có BOM cho Excel, chống CSV-injection |
| API REST + zod theo danh sách | ✅ Đã làm | Thêm: `/api/shops/{slug}/display`, `/api/staff/auth/*`, `POST /api/staff/settings` (đổi khoá TV) |
| `GET /api/shops/{slug}/stream` (SSE) + LISTEN/NOTIFY | 🔁 Thay thế | **Supabase Realtime** thay cho SSE, vì Vercel serverless không giữ được kết nối SSE lâu. Vẫn đủ: đẩy snapshot, `version`, fallback polling 15s, chạy nhiều instance |
| PostgreSQL 16 + Prisma | 🔁 Thay thế | Supabase Postgres 17 + **SQL migrations** của Supabase CLI. Logic nằm trong hàm SQL nên không cần ORM |
| Dockerfile + docker-compose, Nginx + Let's Encrypt | 🔁 Thay thế | Deploy lên **Vercel** (HTTPS tự động). Docker chỉ dùng cho Supabase local |
| Auth session cookie tự quản lý, bcrypt | ✅ Đã làm | |
| QR `qrcode`, ngày giờ `date-fns-tz` / múi giờ VN | ✅ Đã làm | |
| shadcn/ui | ⚠️ Một phần | Component tự viết theo phong cách shadcn (cva + tailwind-merge), không cài bằng CLI để giữ bundle nhỏ |
| PWA (manifest, icon) | ✅ Đã làm | Chưa có service worker / offline (không cần cho "Thêm vào màn hình chính") |
| Tiếng Việt, chữ ≥ 16px, nút ≥ 44px, mobile-first | ✅ Đã làm | |
| Rate limit, token ≥ 128-bit, CSRF, không lộ dữ liệu khách khác, header bảo mật | ✅ Đã làm | CSP còn dùng `'unsafe-inline'` cho script (Next.js cần nếu không dùng nonce) |
| Chịu 200 khách mở trang cùng lúc | ⚠️ Chưa đo tải | Realtime do Supabase gánh. Gói Free giới hạn 200 kết nối realtime, vượt thì client tự chuyển sang polling. Chưa chạy load test |
| Log có cấu trúc (pino) | ✅ Đã làm | JSON ra stdout, xem trong Vercel Logs |
| Unit test state machine + test đồng thời | ✅ Đã làm | 36 test pass |
| E2E Playwright < 2s | ✅ Đã làm | Đo được ~0,1 giây ở local |
| Seed: tiệm demo, owner/staff, mã 1234, 12 vé | ✅ Đã làm | |
| README tiếng Việt | ✅ Đã làm | |
| Ngoài phạm vi: đặt lịch, cọc, Zalo ZNS/SMS, nhiều phòng | ⏭ Chưa làm (đúng yêu cầu) | Đã có `station_id` trên tickets |
