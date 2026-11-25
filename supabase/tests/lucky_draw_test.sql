-- =====================================================================
-- ทดสอบเจ้าแม่คงคาประกาศผู้โชคดี (run_lucky_draw / get_lucky_draw_state) แบบจำลองเวลา
-- วิธีใช้: SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- ⚠️ ผลลัพธ์จะขึ้นเป็น "ERROR: TEST REPORT ..." โดยตั้งใจ
--    การ raise exception ตอนจบทำให้ทุกอย่างถูกย้อนกลับทั้งหมด (ไม่เปิดกิจกรรมจริง ไม่ใช้สิทธิ์จับจริง ไม่มีแถวทดสอบค้าง)
--    อ่านผลในข้อความ: ทุกบรรทัดต้องขึ้น PASS และบรรทัดสุดท้ายต้องเป็น "ALL PASSED"
-- =====================================================================
do $$
declare
  t0     timestamptz := now() + interval '1 day';   -- เวลาเปิดกิจกรรม (จำลอง อนาคต กันชนข้อมูลจริง)
  report text := '';
  fails  int := 0;
  ok     boolean;
  r      uuid;
  before_id uuid; a uuid; b uuid; c uuid; inv uuid; late uuid;
  hits_a int := 0; hits_b int := 0; hits_c int := 0; hits_inv int := 0;
  n int;
  i int;
  st json;
begin
  -- เริ่มจากสถานะว่าง (ย้อนกลับตอนจบ)
  delete from public.lucky_draws;
  update public.lucky_draw_config set enabled = false, enabled_at = null, delay_seconds = 120, hold_seconds = 300 where id = 1;

  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบก่อนเปิด', 'x', 'ice', '{}', t0 - interval '1 second') returning id into before_id;

  ---------------------------------------------------------------------------
  -- 1) enabled = false: สร้างกระทงกี่ใบก็ไม่จับ
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบA', 'x', 'banana_leaf', '{flowers}', t0 + interval '10 seconds') returning id into a;
  r := public.run_lucky_draw(t0 + interval '1 hour');
  select count(*) into n from public.lucky_draws;
  ok := r is null and n = 0;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 1) enabled = false → ไม่จับ';

  ---------------------------------------------------------------------------
  -- 2) เปิดกิจกรรมที่ t0: ใบแรกสร้างที่ t0+10s → ยังไม่จับก่อนครบ 120 วินาที / ครบแล้วจับ
  update public.lucky_draw_config set enabled = true, enabled_at = t0 where id = 1;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบB', 'x', 'bread', '{coin10}', t0 + interval '30 seconds') returning id into b;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบC', 'x', 'ice', '{nail}', t0 + interval '60 seconds') returning id into c;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบล่องหน', 'x', 'invisible', '{flowers,coin10}', t0 + interval '90 seconds') returning id into inv;

  r := public.run_lucky_draw(t0 + interval '10 seconds' + interval '119 seconds');
  select count(*) into n from public.lucky_draws;
  ok := r is null and n = 0;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 2a) ใบแรก +119 วิ → ยังไม่จับ';

  r := public.run_lucky_draw(t0 + interval '10 seconds' + interval '120 seconds');
  select count(*) into n from public.lucky_draws;
  ok := r is not null and n = 1 and r in (a, b, c, inv);
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 2b) ใบแรก +120 วิ → จับ 1 ครั้ง ได้กระทงของกิจกรรม';

  ---------------------------------------------------------------------------
  -- 3) จับแล้ว สร้างกระทงเพิ่ม → ไม่จับซ้ำ
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบมาทีหลัง', 'x', 'ice', '{}', t0 + interval '5 minutes') returning id into late;
  for i in 1..20 loop
    r := public.run_lucky_draw(t0 + interval '10 minutes' + make_interval(secs => i * 10));
    if r is not null then fails := fails + 1; end if;
  end loop;
  select count(*) into n from public.lucky_draws;
  ok := n = 1;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || format(' 3) จับแล้ว เรียกซ้ำอีก 20 รอบ → ยังมี %s แถว (ต้อง = 1)', n);

  -- 4) insert แถวที่สองตรงๆ → ต้องถูกปฏิเสธ (unique index ((true)))
  begin
    insert into public.lucky_draws (krathong_id) values (late);
    ok := false;
  exception when unique_violation then
    ok := true;
  end;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 4) insert แถวที่สองเข้า lucky_draws → ปฏิเสธ (unique_violation)';

  -- 5) ลบกระทงที่ชนะไม่ได้ ถ้ายังไม่ลบผลการจับ (กันจับใหม่โดยไม่ตั้งใจ)
  begin
    delete from public.krathongs where id = (select krathong_id from public.lucky_draws);
    ok := false;
  exception when foreign_key_violation then
    ok := true;
  end;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 5) ลบกระทงผู้ชนะก่อนลบผลการจับ → ปฏิเสธ (foreign key)';

  ---------------------------------------------------------------------------
  -- 6) สุ่มจริง: จับใหม่ 400 ครั้ง (ลบผลทุกครั้ง) ทั้ง 4 ใบของกิจกรรมต้องเคยชนะ (รวมกระทงล่องหน)
  --    และไม่เคยเลือกใบที่สร้างก่อนเปิดกิจกรรม
  for i in 1..400 loop
    delete from public.lucky_draws;
    r := public.run_lucky_draw(t0 + interval '3 minutes');   -- ณ ตอนนั้นมี A B C ล่องหน (ใบมาทีหลังยังไม่เกิด)
    if r = a then hits_a := hits_a + 1; elsif r = b then hits_b := hits_b + 1; elsif r = c then hits_c := hits_c + 1;
    elsif r = inv then hits_inv := hits_inv + 1; else fails := fails + 1; end if;
  end loop;
  ok := least(hits_a, hits_b, hits_c, hits_inv) >= 60;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end
    || format(' 6) สุ่ม 400 ครั้ง A=%s B=%s C=%s ล่องหน=%s (ต่ำสุด ≥60) ไม่เคยได้ใบก่อนเปิด/ใบที่ยังไม่เกิด', hits_a, hits_b, hits_c, hits_inv);

  ---------------------------------------------------------------------------
  -- 7) get_lucky_draw_state: ไม่มีผล → krathong null / มีผล → ข้อมูลผู้ชนะ ไม่มีคำอธิษฐาน
  delete from public.lucky_draws;
  st := public.get_lucky_draw_state();
  ok := (st ->> 'krathong') is null and (st ->> 'drawn_at') is null and (st ->> 'hold_seconds')::int = 300 and (st ->> 'server_now') is not null;
  insert into public.lucky_draws (krathong_id, drawn_at) values (inv, t0 + interval '3 minutes');
  st := public.get_lucky_draw_state();
  ok := ok and (st -> 'krathong' ->> 'id')::uuid = inv and st -> 'krathong' ->> 'name' = 'ทดสอบล่องหน'
     and st -> 'krathong' ->> 'krathong_type' = 'invisible' and (st -> 'krathong' -> 'wish') is null
     and (st ->> 'drawn_at')::timestamptz = t0 + interval '3 minutes';
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 7) get_lucky_draw_state คืนเวลา server / hold / ผู้ชนะ (ไม่มีคำอธิษฐาน)';

  ---------------------------------------------------------------------------
  -- 8) สิทธิ์ / cron / realtime
  ok := not has_function_privilege('anon', 'public.run_lucky_draw(timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.run_lucky_draw(timestamptz)', 'execute')
    and has_function_privilege('anon', 'public.get_lucky_draw_state()', 'execute');
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 8a) anon เรียก run_lucky_draw ไม่ได้ / เรียก get_lucky_draw_state ได้';

  ok := has_table_privilege('anon', 'public.lucky_draws', 'select')
    and not has_table_privilege('anon', 'public.lucky_draws', 'insert')
    and not has_table_privilege('anon', 'public.lucky_draws', 'update')
    and not has_table_privilege('anon', 'public.lucky_draws', 'delete')
    and not has_table_privilege('anon', 'public.lucky_draw_config', 'select')
    and not has_table_privilege('anon', 'public.lucky_draw_config', 'update');
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 8b) anon อ่าน lucky_draws ได้อย่างเดียว / แตะ lucky_draw_config ไม่ได้';

  ok := exists (select 1 from cron.job where jobname = 'run-lucky-draw' and schedule = '10 seconds' and active)
    and exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lucky_draws');
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 8c) cron run-lucky-draw ทุก 10 วินาที + lucky_draws อยู่ใน supabase_realtime';

  raise exception 'TEST REPORT (ไม่ใช่ error จริง: ย้อนข้อมูลทดสอบทั้งหมดแล้ว)%', report
    || E'\n\n' || case when fails = 0 then 'ALL PASSED' else fails || ' FAILED' end;
end;
$$;
