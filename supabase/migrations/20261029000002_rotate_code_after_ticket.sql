-- Đổi mã ngày sau mỗi lượt nhận số mới để mã đã dùng không tiếp tục có hiệu lực.
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
  else
    update public.daily_sessions
       set checkin_code = public.pb_random_code(se.checkin_code), code_updated_at = now()
     where id = se.id;
  end if;

  perform public.pb_refresh_state(se.id);
  return jsonb_build_object('ok', true, 'existing', false, 'ticket', public.pb_ticket_json(t));
end $$;
