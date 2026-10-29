-- =====================================================================
-- Photobooth queue — schema + state machine (Supabase / PostgreSQL)
-- Mọi thao tác thay đổi hàng đợi đi qua các hàm pb_* bên dưới, mỗi hàm
-- chạy trong 1 transaction và khoá dòng daily_sessions (FOR UPDATE)
-- nên cấp số / chuyển lượt luôn tuần tự, không trùng, không nhảy số.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table public.shops (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name                    text not null check (length(name) between 1 and 80),
  logo_url                text,
  primary_color           text not null default '#e11d48' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  timezone                text not null default 'Asia/Ho_Chi_Minh',
  grace_turns             int  not null default 2  check (grace_turns between 0 and 20),
  default_service_minutes int  not null default 10 check (default_service_minutes between 1 and 180),
  day_reset_time          time not null default '00:00',
  code_mode               text not null default 'AUTO' check (code_mode in ('AUTO', 'MANUAL')),
  code_rotate_hours       int  not null default 0  check (code_rotate_hours between 0 and 24),
  phone_retention_days    int  not null default 30 check (phone_retention_days between 1 and 3650),
  is_paused               boolean not null default false,
  display_key             text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at              timestamptz not null default now()
);

create table public.staff_users (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  display_name  text not null default '',
  password_hash text not null,
  role          text not null default 'STAFF' check (role in ('OWNER', 'STAFF')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on public.staff_users (shop_id);

create table public.staff_sessions (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  staff_id   uuid not null references public.staff_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.staff_sessions (staff_id);

create table public.daily_sessions (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  business_date   date not null,
  checkin_code    text not null check (checkin_code ~ '^[0-9]{4}$'),
  code_updated_at timestamptz not null default now(),
  last_number     int not null default 0,  -- số đã cấp gần nhất
  serve_count     int not null default 0,  -- số lần có vé chuyển sang SERVING (dùng tính ân hạn)
  action_seq      int not null default 0,  -- tăng mỗi thao tác nhân viên (dùng kiểm tra hoàn tác)
  created_at      timestamptz not null default now(),
  unique (shop_id, business_date)
);

create table public.tickets (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references public.shops(id) on delete cascade,
  session_id          uuid not null references public.daily_sessions(id) on delete cascade,
  business_date       date not null,
  number              int  not null check (number > 0),
  token               text not null unique,
  customer_name       text not null,
  phone               text,
  source              text not null default 'QR' check (source in ('QR', 'MANUAL')),
  status              text not null default 'WAITING'
                        check (status in ('WAITING', 'SERVING', 'DONE', 'SKIPPED', 'EXPIRED', 'CANCELLED')),
  station_id          uuid,                 -- dự phòng nhiều phòng chụp (chưa dùng)
  created_at          timestamptz not null default now(),
  called_at           timestamptz,
  done_at             timestamptz,
  skipped_at          timestamptz,
  skipped_after_count int,
  recalled_at         timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        text check (cancelled_by in ('CUSTOMER', 'STAFF')),
  unique (session_id, number),
  unique (shop_id, business_date, number)
);
create index tickets_session_status_number on public.tickets (session_id, status, number);
-- 1 SĐT chỉ có tối đa 1 vé đang hiệu lực trong 1 ngày
create unique index tickets_one_active_per_phone on public.tickets (session_id, phone)
  where phone is not null and status in ('WAITING', 'SERVING', 'SKIPPED');

create table public.audit_logs (
  id         bigserial primary key,
  shop_id    uuid not null references public.shops(id) on delete cascade,
  staff_id   uuid references public.staff_users(id) on delete set null,
  action     text not null,
  ticket_id  uuid references public.tickets(id) on delete set null,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs (shop_id, id desc);

-- Snapshot công khai của hàng đợi (KHÔNG chứa tên/SĐT/mã ngày).
-- Bảng này được phát realtime tới khách / màn hình tiệm.
create table public.queue_state (
  shop_id    uuid primary key references public.shops(id) on delete cascade,
  version    bigint not null default 0,
  snapshot   jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

create table public.idempotency_keys (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  key        text not null,
  response   jsonb not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, key)
);

-- ---------- Helpers ---------------------------------------------------

create or replace function public.pb_business_date(p_tz text, p_reset time, p_at timestamptz default now())
returns date language sql stable as $$
  select ((p_at at time zone p_tz) - p_reset::interval)::date
$$;

create or replace function public.pb_random_code(p_not text default null)
returns text language plpgsql volatile as $$
declare v text;
begin
  loop
    v := lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when p_not is null or v <> p_not;
  end loop;
  return v;
end $$;

create or replace function public.pb_err(p_code text, p_message text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'error', p_code, 'message', p_message)
$$;

-- Fixed-window rate limiter. p_inc = 0 để chỉ kiểm tra. Trả về số lần trong cửa sổ hiện tại.
create or replace function public.pb_rate_hit(p_key text, p_window_seconds int, p_inc int default 1)
returns int language plpgsql volatile as $$
declare v_count int;
begin
  insert into public.rate_limits as r (key, count, window_start)
  values (p_key, p_inc, now())
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                 then p_inc else r.count + p_inc end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end
  returning count into v_count;
  return v_count;
end $$;

-- ---------- Snapshot --------------------------------------------------

create or replace function public.pb_refresh_state(p_session_id uuid)
returns jsonb language plpgsql volatile as $$
declare
  se public.daily_sessions;
  s  public.shops;
  v_cur record;
  v_queue jsonb;
  v_skipped jsonb;
  v_avg numeric;
  v_n int;
  v_ver bigint;
  v_snap jsonb;
begin
  select * into se from public.daily_sessions where id = p_session_id;
  select * into s from public.shops where id = se.shop_id;

  select number, called_at into v_cur
    from public.tickets where session_id = se.id and status = 'SERVING'
    order by called_at desc limit 1;

  -- Thứ tự sẽ được gọi: vé "Gọi lại" trước (theo lúc gọi lại), rồi WAITING theo số.
  select coalesce(jsonb_agg(q.number order by q.grp, q.ord), '[]'::jsonb) into v_queue from (
    select number, 0 as grp, extract(epoch from recalled_at)::numeric as ord
      from public.tickets where session_id = se.id and status = 'SKIPPED' and recalled_at is not null
    union all
    select number, 1, number::numeric
      from public.tickets where session_id = se.id and status = 'WAITING'
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
           'number', number,
           'turnsLeft', greatest(s.grace_turns - (se.serve_count - coalesce(skipped_after_count, se.serve_count)), 0),
           'recalled', recalled_at is not null) order by number), '[]'::jsonb)
    into v_skipped
    from public.tickets where session_id = se.id and status = 'SKIPPED';

  select avg(extract(epoch from done_at - called_at)), count(*) into v_avg, v_n
    from public.tickets
   where session_id = se.id and status = 'DONE' and called_at is not null and done_at is not null
     and done_at - called_at between interval '30 seconds' and interval '3 hours';

  select version + 1 into v_ver from public.queue_state where shop_id = s.id for update;
  v_ver := coalesce(v_ver, 1);

  v_snap := jsonb_build_object(
    'shopId', s.id,
    'businessDate', se.business_date,
    'currentNumber', v_cur.number,
    'currentCalledAt', v_cur.called_at,
    'queue', v_queue,
    'nextNumbers', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(v_queue) x limit 5) t), '[]'::jsonb),
    'skippedInGrace', v_skipped,
    'waitingCount', jsonb_array_length(v_queue),
    'avgServiceSeconds', case when v_n >= 2 then round(v_avg)::int else s.default_service_minutes * 60 end,
    'avgFromData', v_n >= 2,
    'isPaused', s.is_paused,
    'graceTurns', s.grace_turns,
    'serveCount', se.serve_count,
    'version', v_ver,
    'updatedAt', now()
  );

  insert into public.queue_state (shop_id, version, snapshot, updated_at)
  values (s.id, v_ver, v_snap, now())
  on conflict (shop_id) do update set version = excluded.version, snapshot = excluded.snapshot, updated_at = now();

  return v_snap;
end $$;

-- ---------- Session (ngày làm việc) ------------------------------------

-- Lấy (hoặc tạo) phiên của ngày làm việc hiện tại. p_lock = true → khoá FOR UPDATE.
-- Lazy: tạo ngày mới (reset số về 1), tự đổi mã mỗi N giờ, dọn dữ liệu cũ.
create or replace function public.pb_get_session(p_shop_id uuid, p_lock boolean default false)
returns public.daily_sessions language plpgsql volatile as $$
declare
  s public.shops;
  r public.daily_sessions;
  v_date date;
  v_prev text;
  v_created boolean := false;
  v_rotated boolean := false;
begin
  select * into s from public.shops where id = p_shop_id;
  if not found then raise exception 'SHOP_NOT_FOUND'; end if;
  v_date := public.pb_business_date(s.timezone, s.day_reset_time);

  if not exists (select 1 from public.daily_sessions where shop_id = p_shop_id and business_date = v_date) then
    if s.code_mode = 'MANUAL' then
      select checkin_code into v_prev from public.daily_sessions
       where shop_id = p_shop_id order by business_date desc limit 1;
    end if;
    insert into public.daily_sessions (shop_id, business_date, checkin_code)
    values (p_shop_id, v_date, coalesce(v_prev, public.pb_random_code()))
    on conflict (shop_id, business_date) do nothing;
    if found then
      v_created := true;
      -- dọn dẹp mỗi ngày
      update public.tickets set phone = null
       where shop_id = p_shop_id and phone is not null
         and created_at < now() - make_interval(days => s.phone_retention_days);
      delete from public.rate_limits where window_start < now() - interval '1 day';
      delete from public.idempotency_keys where shop_id = p_shop_id and created_at < now() - interval '1 day';
      delete from public.staff_sessions where shop_id = p_shop_id and expires_at < now();
    end if;
  end if;

  if p_lock or (s.code_rotate_hours > 0) then
    select * into r from public.daily_sessions where shop_id = p_shop_id and business_date = v_date for update;
  else
    select * into r from public.daily_sessions where shop_id = p_shop_id and business_date = v_date;
  end if;

  if s.code_rotate_hours > 0 and r.code_updated_at < now() - make_interval(hours => s.code_rotate_hours) then
    update public.daily_sessions
       set checkin_code = public.pb_random_code(r.checkin_code), code_updated_at = now()
     where id = r.id
    returning * into r;
    v_rotated := true;
    insert into public.audit_logs (shop_id, action, payload)
    values (p_shop_id, 'CODE_AUTO_ROTATE', jsonb_build_object('sessionId', r.id));
  end if;

  if v_created or v_rotated then
    perform public.pb_refresh_state(r.id);
  end if;
  return r;
end $$;

-- ---------- Ticket JSON -----------------------------------------------

create or replace function public.pb_ticket_json(t public.tickets)
returns jsonb language plpgsql stable as $$
declare
  se public.daily_sessions;
  s  public.shops;
  v_cur_date date;
begin
  select * into se from public.daily_sessions where id = t.session_id;
  select * into s from public.shops where id = t.shop_id;
  v_cur_date := public.pb_business_date(s.timezone, s.day_reset_time);
  return jsonb_build_object(
    'id', t.id,
    'number', t.number,
    'token', t.token,
    'name', t.customer_name,
    'status', t.status,
    'source', t.source,
    'businessDate', t.business_date,
    'isToday', t.business_date = v_cur_date,
    'createdAt', t.created_at,
    'calledAt', t.called_at,
    'doneAt', t.done_at,
    'skippedAt', t.skipped_at,
    'recalled', t.recalled_at is not null,
    'cancelledAt', t.cancelled_at,
    'turnsLeft', case when t.status = 'SKIPPED'
                      then greatest(s.grace_turns - (se.serve_count - coalesce(t.skipped_after_count, se.serve_count)), 0)
                      end,
    'shop', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name,
                               'logoUrl', s.logo_url, 'primaryColor', s.primary_color)
  );
end $$;

-- ---------- Public API --------------------------------------------------

create or replace function public.pb_public_state(p_shop_id uuid)
returns jsonb language plpgsql volatile as $$
declare se public.daily_sessions; v jsonb;
begin
  se := public.pb_get_session(p_shop_id, false);
  select snapshot into v from public.queue_state where shop_id = p_shop_id;
  if v is null or (v->>'businessDate')::date <> se.business_date then
    v := public.pb_refresh_state(se.id);
  end if;
  return v;
end $$;

create or replace function public.pb_display_state(p_shop_id uuid)
returns jsonb language plpgsql volatile as $$
declare se public.daily_sessions;
begin
  se := public.pb_get_session(p_shop_id, false);
  return jsonb_build_object(
    'state', public.pb_public_state(p_shop_id),
    'checkinCode', se.checkin_code,
    'codeUpdatedAt', se.code_updated_at);
end $$;

-- Lấy số. p_source = 'QR' (khách, cần mã ngày) | 'MANUAL' (nhân viên thêm).
create or replace function public.pb_create_ticket(
  p_shop_id uuid, p_code text, p_name text, p_phone text, p_source text, p_token text, p_staff_id uuid default null)
returns jsonb language plpgsql volatile as $$
declare
  se public.daily_sessions;
  s  public.shops;
  t  public.tickets;
  v_num int;
begin
  se := public.pb_get_session(p_shop_id, true);
  select * into s from public.shops where id = p_shop_id;

  if p_source = 'QR' then
    if s.is_paused then
      return public.pb_err('PAUSED', 'Tiệm đang tạm ngưng nhận số. Bạn vui lòng quay lại sau nhé!');
    end if;
    if p_code is distinct from se.checkin_code then
      return public.pb_err('BAD_CODE', 'Mã không đúng, vui lòng xem mã trên màn hình tại quầy.');
    end if;
  end if;

  if p_phone is not null then
    select * into t from public.tickets
     where session_id = se.id and phone = p_phone and status in ('WAITING', 'SERVING', 'SKIPPED')
     limit 1;
    if found then
      return jsonb_build_object('ok', true, 'existing', true, 'ticket', public.pb_ticket_json(t));
    end if;
  end if;

  update public.daily_sessions set last_number = last_number + 1 where id = se.id
  returning last_number into v_num;

  insert into public.tickets (shop_id, session_id, business_date, number, token, customer_name, phone, source)
  values (p_shop_id, se.id, se.business_date, v_num, p_token, p_name, p_phone, p_source)
  returning * into t;

  if p_source = 'MANUAL' then
    insert into public.audit_logs (shop_id, staff_id, action, ticket_id, payload)
    values (p_shop_id, p_staff_id, 'MANUAL_ADD', t.id, jsonb_build_object('number', v_num));
  end if;

  perform public.pb_refresh_state(se.id);
  return jsonb_build_object('ok', true, 'existing', false, 'ticket', public.pb_ticket_json(t));
end $$;

create or replace function public.pb_ticket_view(p_token text)
returns jsonb language plpgsql volatile as $$
declare t public.tickets;
begin
  select * into t from public.tickets where token = p_token;
  if not found then return public.pb_err('NOT_FOUND', 'Không tìm thấy vé.'); end if;
  return jsonb_build_object('ok', true,
                            'ticket', public.pb_ticket_json(t),
                            'state', public.pb_public_state(t.shop_id));
end $$;

-- Tra cứu bằng SĐT + mã ngày: trả về vé còn hiệu lực (hoặc vé gần nhất) hôm nay.
create or replace function public.pb_lookup_ticket(p_shop_id uuid, p_phone text, p_code text)
returns jsonb language plpgsql volatile as $$
declare se public.daily_sessions; t public.tickets;
begin
  se := public.pb_get_session(p_shop_id, false);
  if p_code is distinct from se.checkin_code then
    return public.pb_err('BAD_CODE', 'Mã không đúng, vui lòng xem mã trên màn hình tại quầy.');
  end if;
  select * into t from public.tickets
   where session_id = se.id and phone = p_phone
   order by (status in ('WAITING', 'SERVING', 'SKIPPED')) desc, number desc
   limit 1;
  if not found then
    return public.pb_err('NOT_FOUND', 'Không tìm thấy số nào hôm nay với số điện thoại này.');
  end if;
  return jsonb_build_object('ok', true, 'ticket', public.pb_ticket_json(t));
end $$;

create or replace function public.pb_customer_cancel(p_token text)
returns jsonb language plpgsql volatile as $$
declare t public.tickets; se public.daily_sessions;
begin
  select * into t from public.tickets where token = p_token;
  if not found then return public.pb_err('NOT_FOUND', 'Không tìm thấy vé.'); end if;
  se := public.pb_get_session(t.shop_id, true);
  select * into t from public.tickets where id = t.id;
  if t.session_id <> se.id or t.status not in ('WAITING', 'SKIPPED') then
    return public.pb_err('INVALID_STATE', 'Vé này không thể huỷ nữa.');
  end if;
  update public.tickets set status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'CUSTOMER'
   where id = t.id returning * into t;
  -- vé SKIPPED nằm trong dữ liệu hoàn tác → huỷ khả năng hoàn tác để không khôi phục sai
  update public.daily_sessions set action_seq = action_seq + 1 where id = se.id;
  insert into public.audit_logs (shop_id, action, ticket_id, payload)
  values (t.shop_id, 'CUSTOMER_CANCEL', t.id, jsonb_build_object('number', t.number));
  perform public.pb_refresh_state(se.id);
  return jsonb_build_object('ok', true, 'ticket', public.pb_ticket_json(t));
end $$;

-- ---------- Staff: state machine ----------------------------------------

-- Gọi vé kế tiếp lên SERVING (vé "Gọi lại" ưu tiên trước WAITING),
-- rồi chuyển các vé SKIPPED quá ân hạn sang EXPIRED. Trả về id vé được gọi.
create or replace function public.pb_serve_next(p_session_id uuid, p_grace int)
returns uuid language plpgsql volatile as $$
declare v_id uuid; v_count int;
begin
  select id into v_id from public.tickets
   where session_id = p_session_id and status = 'SKIPPED' and recalled_at is not null
   order by recalled_at limit 1;
  if v_id is null then
    select id into v_id from public.tickets
     where session_id = p_session_id and status = 'WAITING'
     order by number limit 1;
  end if;
  if v_id is null then return null; end if;

  update public.daily_sessions set serve_count = serve_count + 1 where id = p_session_id
  returning serve_count into v_count;
  update public.tickets set status = 'SERVING', called_at = now() where id = v_id;
  update public.tickets set status = 'EXPIRED'
   where session_id = p_session_id and status = 'SKIPPED' and recalled_at is null
     and v_count - skipped_after_count > p_grace;
  return v_id;
end $$;

-- p_action: NEXT | SKIP | RECALL | CANCEL | UNDO
create or replace function public.pb_staff_action(
  p_shop_id uuid, p_staff_id uuid, p_action text, p_ticket_id uuid default null, p_idem_key text default null)
returns jsonb language plpgsql volatile as $$
declare
  se public.daily_sessions;
  s  public.shops;
  v_cur public.tickets;
  t public.tickets;
  v_log public.audit_logs;
  v_before jsonb;
  v_served uuid;
  v_seq int;
  v_res jsonb;
begin
  se := public.pb_get_session(p_shop_id, true);   -- khoá: mọi thao tác tuần tự
  select * into s from public.shops where id = p_shop_id;

  if p_idem_key is not null then
    select response into v_res from public.idempotency_keys where shop_id = p_shop_id and key = p_idem_key;
    if found then return v_res || jsonb_build_object('replayed', true); end if;
  end if;

  if p_action in ('NEXT', 'SKIP', 'RECALL') then
    -- Lưu trạng thái trước để hoàn tác (chỉ các cột trạng thái, không lưu dữ liệu cá nhân)
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'status', x.status, 'called_at', x.called_at, 'done_at', x.done_at,
             'skipped_at', x.skipped_at, 'skipped_after_count', x.skipped_after_count,
             'recalled_at', x.recalled_at)), '[]'::jsonb)
      into v_before
      from public.tickets x
     where x.session_id = se.id
       and (x.status in ('SERVING', 'SKIPPED')
            or x.id = (select id from public.tickets where session_id = se.id and status = 'WAITING'
                       order by number limit 1));
  end if;

  select * into v_cur from public.tickets where session_id = se.id and status = 'SERVING' limit 1;

  if p_action = 'NEXT' then
    if v_cur.id is not null then
      update public.tickets set status = 'DONE', done_at = now() where id = v_cur.id;
    end if;
    v_served := public.pb_serve_next(se.id, s.grace_turns);
    if v_cur.id is null and v_served is null then
      return public.pb_err('EMPTY', 'Không còn khách nào đang chờ.');
    end if;

  elsif p_action = 'SKIP' then
    if v_cur.id is null then
      return public.pb_err('NO_SERVING', 'Hiện không có lượt nào đang chụp.');
    end if;
    update public.tickets
       set status = 'SKIPPED', skipped_at = now(), skipped_after_count = se.serve_count, recalled_at = null
     where id = v_cur.id;
    v_served := public.pb_serve_next(se.id, s.grace_turns);

  elsif p_action = 'RECALL' then
    select * into t from public.tickets where id = p_ticket_id and shop_id = p_shop_id;
    if not found or t.session_id <> se.id or t.status <> 'SKIPPED'
       or t.recalled_at is not null or se.serve_count - t.skipped_after_count > s.grace_turns then
      return public.pb_err('NOT_RECALLABLE', 'Vé này không còn trong thời gian ân hạn.');
    end if;
    update public.tickets set recalled_at = now() where id = t.id;
    if v_cur.id is null then
      v_served := public.pb_serve_next(se.id, s.grace_turns);
    end if;

  elsif p_action = 'CANCEL' then
    select * into t from public.tickets where id = p_ticket_id and shop_id = p_shop_id;
    if not found or t.status not in ('WAITING', 'SKIPPED') then
      return public.pb_err('INVALID_STATE', 'Chỉ huỷ được vé đang chờ hoặc đã gọi lỡ.');
    end if;
    update public.tickets set status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'STAFF' where id = t.id;

  elsif p_action = 'UNDO' then
    select * into v_log from public.audit_logs
     where shop_id = p_shop_id and action in ('NEXT', 'SKIP', 'RECALL')
       and payload->>'sessionId' = se.id::text
     order by id desc limit 1;
    if not found or coalesce((v_log.payload->>'undone')::boolean, false)
       or v_log.created_at < now() - interval '60 seconds'
       or (v_log.payload->>'seq')::int <> se.action_seq then
      return public.pb_err('NOTHING_TO_UNDO', 'Không có thao tác nào để hoàn tác (chỉ hoàn tác trong 60 giây).');
    end if;
    update public.tickets x
       set status = b.status, called_at = b.called_at, done_at = b.done_at, skipped_at = b.skipped_at,
           skipped_after_count = b.skipped_after_count, recalled_at = b.recalled_at
      from jsonb_populate_recordset(null::public.tickets, v_log.payload->'before') b
     where x.id = b.id;
    update public.daily_sessions set serve_count = (v_log.payload->>'serveCountBefore')::int where id = se.id;
    update public.audit_logs set payload = payload || '{"undone": true}'::jsonb where id = v_log.id;
    p_ticket_id := v_log.ticket_id;

  else
    return public.pb_err('BAD_ACTION', 'Thao tác không hợp lệ.');
  end if;

  update public.daily_sessions set action_seq = action_seq + 1 where id = se.id
  returning action_seq into v_seq;

  insert into public.audit_logs (shop_id, staff_id, action, ticket_id, payload)
  values (p_shop_id, p_staff_id, p_action, coalesce(p_ticket_id, v_cur.id, v_served),
          jsonb_strip_nulls(jsonb_build_object(
            'sessionId', se.id, 'seq', v_seq, 'before', v_before,
            'serveCountBefore', case when v_before is not null then se.serve_count end,
            'previousTicketId', v_cur.id, 'servedTicketId', v_served,
            'undoneLogId', case when p_action = 'UNDO' then v_log.id end)));

  v_res := jsonb_build_object(
    'ok', true,
    'action', p_action,
    'servedNumber', (select number from public.tickets where id = v_served),
    'state', public.pb_refresh_state(se.id));

  if p_idem_key is not null then
    insert into public.idempotency_keys (shop_id, key, response) values (p_shop_id, p_idem_key, v_res)
    on conflict do nothing;
  end if;
  return v_res;
end $$;

create or replace function public.pb_set_code(p_shop_id uuid, p_staff_id uuid, p_code text default null)
returns jsonb language plpgsql volatile as $$
declare se public.daily_sessions;
begin
  if p_code is not null and p_code !~ '^[0-9]{4}$' then
    return public.pb_err('BAD_CODE_FORMAT', 'Mã ngày phải gồm đúng 4 chữ số.');
  end if;
  se := public.pb_get_session(p_shop_id, true);
  update public.daily_sessions
     set checkin_code = coalesce(p_code, public.pb_random_code(se.checkin_code)), code_updated_at = now()
   where id = se.id returning * into se;
  insert into public.audit_logs (shop_id, staff_id, action, payload)
  values (p_shop_id, p_staff_id, 'ROTATE_CODE', jsonb_build_object('custom', p_code is not null));
  perform public.pb_refresh_state(se.id);
  return jsonb_build_object('ok', true, 'checkinCode', se.checkin_code, 'codeUpdatedAt', se.code_updated_at);
end $$;

create or replace function public.pb_set_paused(p_shop_id uuid, p_staff_id uuid, p_paused boolean)
returns jsonb language plpgsql volatile as $$
declare se public.daily_sessions;
begin
  se := public.pb_get_session(p_shop_id, true);
  update public.shops set is_paused = p_paused where id = p_shop_id;
  insert into public.audit_logs (shop_id, staff_id, action)
  values (p_shop_id, p_staff_id, case when p_paused then 'PAUSE' else 'RESUME' end);
  return jsonb_build_object('ok', true, 'state', public.pb_refresh_state(se.id));
end $$;

-- Gọi sau khi đổi cài đặt tiệm để snapshot cập nhật.
create or replace function public.pb_touch_state(p_shop_id uuid)
returns jsonb language plpgsql volatile as $$
declare se public.daily_sessions;
begin
  se := public.pb_get_session(p_shop_id, true);
  return public.pb_refresh_state(se.id);
end $$;

-- Toàn bộ hàng đợi cho nhân viên (có tên/SĐT).
create or replace function public.pb_staff_queue(p_shop_id uuid)
returns jsonb language plpgsql volatile as $$
declare
  se public.daily_sessions;
  s public.shops;
  v_log public.audit_logs;
  v_undo jsonb;
begin
  se := public.pb_get_session(p_shop_id, false);
  select * into s from public.shops where id = p_shop_id;

  select * into v_log from public.audit_logs
   where shop_id = p_shop_id and action in ('NEXT', 'SKIP', 'RECALL')
     and payload->>'sessionId' = se.id::text
   order by id desc limit 1;
  if found and not coalesce((v_log.payload->>'undone')::boolean, false)
     and (v_log.payload->>'seq')::int = se.action_seq
     and v_log.created_at > now() - interval '60 seconds' then
    v_undo := jsonb_build_object('action', v_log.action, 'expiresAt', v_log.created_at + interval '60 seconds');
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object('id', se.id, 'businessDate', se.business_date,
                                  'checkinCode', se.checkin_code, 'codeUpdatedAt', se.code_updated_at,
                                  'serveCount', se.serve_count, 'lastNumber', se.last_number),
    'shop', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'isPaused', s.is_paused,
                               'graceTurns', s.grace_turns, 'displayKey', s.display_key),
    'undo', v_undo,
    'serverTime', now(),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'number', t.number, 'name', t.customer_name, 'phone', t.phone,
               'source', t.source, 'status', t.status, 'createdAt', t.created_at,
               'calledAt', t.called_at, 'doneAt', t.done_at, 'skippedAt', t.skipped_at,
               'recalled', t.recalled_at is not null, 'recalledAt', t.recalled_at,
               'turnsLeft', case when t.status = 'SKIPPED'
                                 then greatest(s.grace_turns - (se.serve_count - t.skipped_after_count), 0) end)
             order by t.number)
        from public.tickets t where t.session_id = se.id), '[]'::jsonb)
  );
end $$;

create or replace function public.pb_stats(p_shop_id uuid, p_date date)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'date', p_date,
    'total', count(*),
    'done', count(*) filter (where status = 'DONE'),
    'serving', count(*) filter (where status = 'SERVING'),
    'waiting', count(*) filter (where status = 'WAITING'),
    'skipped', count(*) filter (where status = 'SKIPPED'),
    'expired', count(*) filter (where status = 'EXPIRED'),
    'cancelled', count(*) filter (where status = 'CANCELLED'),
    'manual', count(*) filter (where source = 'MANUAL'),
    'everSkipped', count(*) filter (where skipped_at is not null),
    'avgServiceSeconds', round(avg(extract(epoch from done_at - called_at)) filter (where status = 'DONE' and called_at is not null)),
    'avgWaitSeconds', round(avg(extract(epoch from called_at - created_at)) filter (where called_at is not null))
  )
  from public.tickets where shop_id = p_shop_id and business_date = p_date
$$;

-- ---------- Security ---------------------------------------------------
-- Ứng dụng truy cập DB bằng service_role (chỉ phía server).
-- anon/authenticated chỉ được ĐỌC queue_state (snapshot công khai) để nhận realtime.

alter table public.shops            enable row level security;
alter table public.staff_users      enable row level security;
alter table public.staff_sessions   enable row level security;
alter table public.daily_sessions   enable row level security;
alter table public.tickets          enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.queue_state      enable row level security;
alter table public.rate_limits      enable row level security;
alter table public.idempotency_keys enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select on public.queue_state to anon, authenticated;
create policy "queue_state is public" on public.queue_state for select to anon, authenticated using (true);

alter publication supabase_realtime add table public.queue_state;
