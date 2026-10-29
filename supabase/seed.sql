-- Dữ liệu mẫu: 1 tiệm, 2 tài khoản, mã ngày 1234, 12 vé ở nhiều trạng thái.
-- Chạy tự động bởi `supabase db reset` (local). Trên production chỉ chạy nếu muốn có dữ liệu demo.
do $$
declare
  v_shop uuid;
  v_session uuid;
  v_date date;
  i int;
  v_status text;
  v_names text[] := array['Ngọc Anh', 'Minh Thư', 'Gia Huy', 'Bảo Trân', 'Khánh Linh', 'Quốc Bảo',
                          'Thảo Vy', 'Tuấn Kiệt', 'Hà My', 'Đức Anh', 'Phương Nhi', 'Hoàng Nam'];
begin
  insert into public.shops (slug, name, display_key)
  values ('demo-photobooth', 'Demo Photobooth', 'demo-display-key')
  returning id into v_shop;

  insert into public.staff_users (shop_id, username, display_name, password_hash, role) values
    (v_shop, 'owner', 'Chủ tiệm',  extensions.crypt('owner123', extensions.gen_salt('bf', 10)), 'OWNER'),
    (v_shop, 'staff', 'Nhân viên', extensions.crypt('staff123', extensions.gen_salt('bf', 10)), 'STAFF');

  v_date := public.pb_business_date('Asia/Ho_Chi_Minh', '00:00');
  -- 8 lượt đã được gọi (số 1..8), đã cấp tới số 12
  insert into public.daily_sessions (shop_id, business_date, checkin_code, last_number, serve_count)
  values (v_shop, v_date, '1234', 12, 8)
  returning id into v_session;

  for i in 1..12 loop
    v_status := case
      when i in (1, 2, 3, 4, 6) then 'DONE'
      when i = 5  then 'EXPIRED'    -- bị gọi lỡ ở lượt 5, quá 2 lượt ân hạn
      when i = 7  then 'SKIPPED'    -- bị gọi lỡ ở lượt 7, còn 1 lượt ân hạn
      when i = 8  then 'SERVING'
      when i = 9  then 'CANCELLED'
      else 'WAITING' end;
    insert into public.tickets (shop_id, session_id, business_date, number, token, customer_name, phone, source,
                                status, created_at, called_at, done_at, skipped_at, skipped_after_count,
                                cancelled_at, cancelled_by)
    values (
      v_shop, v_session, v_date, i, 'demo-token-' || i, v_names[i],
      case when i = 11 then null else '09' || lpad((12345600 + i)::text, 8, '0') end,
      case when i = 11 then 'MANUAL' else 'QR' end,
      v_status,
      now() - make_interval(mins => 130 - i * 8),
      case when i <= 8 then now() - make_interval(mins => 100 - i * 11) end,
      case when v_status = 'DONE' then now() - make_interval(mins => 100 - i * 11 - 9) end,
      case when v_status in ('SKIPPED', 'EXPIRED') then now() - make_interval(mins => 100 - i * 11) end,
      case when v_status in ('SKIPPED', 'EXPIRED') then i end,
      case when v_status = 'CANCELLED' then now() - interval '20 minutes' end,
      case when v_status = 'CANCELLED' then 'CUSTOMER' end
    );
  end loop;

  perform public.pb_refresh_state(v_session);
end $$;
