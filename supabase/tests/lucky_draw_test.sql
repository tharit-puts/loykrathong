-- =====================================================================
-- ทดสอบเจ้าแม่คงคา v2 (จับเมื่อครบ draw_threshold ใบ + trigger + cron สำรอง)
-- วิธีใช้: SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- ⚠️ ผลลัพธ์จะขึ้นเป็น "ERROR: TEST REPORT ..." โดยตั้งใจ
--    การ raise exception ตอนจบทำให้ทุกอย่างถูกย้อนกลับทั้งหมด (ไม่เปิดกิจกรรมจริง ไม่ใช้สิทธิ์จับจริง ไม่มีแถวทดสอบค้าง)
--    อ่านผลในข้อความ: ทุกบรรทัดต้องขึ้น PASS และบรรทัดสุดท้ายต้องเป็น "ALL PASSED"
-- =====================================================================
do $$
declare
  report text := '';
  fails  int := 0;
  ok     boolean;
  r      uuid;
  before_id uuid; k1 uuid; k2 uuid; k3 uuid; extra uuid; winner uuid;
  n int;
  i int;
  st json;
  counts jsonb := '{}'::jsonb;
  ins_ok boolean;
begin
  -- เริ่มจากสถานะว่าง (ย้อนกลับตอนจบ)
  delete from public.lucky_draws;
  update public.lucky_draw_config set enabled = false, enabled_at = null, draw_threshold = 3, hold_seconds = 120 where id = 1;

  ---------------------------------------------------------------------------
  -- 0) ค่าเริ่มต้นของคอลัมน์ใหม่
  ok := (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'lucky_draw_config' and column_name = 'draw_threshold') = '12'
    and (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'lucky_draw_config' and column_name = 'hold_seconds') = '120';
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 0) ค่าเริ่มต้น draw_threshold = 12, hold_seconds = 120';

  ---------------------------------------------------------------------------
  -- 1) enabled = false: สร้างกระทงกี่ใบก็ไม่จับ (trigger ออกเร็ว)
  for i in 1..15 loop
    insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบปิดอยู่' || i, 'x', 'ice', '{}');
  end loop;
  r := public.run_lucky_draw();
  select count(*) into n from public.lucky_draws;
  ok := r is null and n = 0;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 1) enabled = false: 15 ใบ ไม่จับ';

  ---------------------------------------------------------------------------
  -- 2) เปิดกิจกรรม (threshold = 3): กระทงก่อนเปิดไม่นับ / ใบที่ 1-2 ไม่จับ / ใบที่ 3 จับทันทีผ่าน trigger
  --    (ใน transaction เดียว now() คงที่ จึงเปิดกิจกรรมย้อนไป 1 นาที แล้วย้ายกระทงทั้งหมดที่มีอยู่ไปก่อนเปิด)
  update public.lucky_draw_config set enabled = true, enabled_at = now() - interval '1 minute' where id = 1;
  update public.krathongs set created_at = now() - interval '2 minutes' where created_at >= now() - interval '1 minute';
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบก่อนเปิด', 'x', 'ice', '{}', now() - interval '90 seconds') returning id into before_id;

  insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบ1', 'x', 'banana_leaf', '{flowers}') returning id into k1;
  insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบ2', 'x', 'bread', '{coin10}') returning id into k2;
  select count(*) into n from public.lucky_draws;
  ok := n = 0;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 2a) ใบที่ 1-2 (ก่อนเปิดกิจกรรมไม่นับ) → ยังไม่จับ';

  insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบ3', 'x', 'invisible', '{nail}') returning id into k3;
  select count(*), max(krathong_id::text)::uuid into n, winner from public.lucky_draws;
  ok := n = 1 and winner in (k1, k2, k3);
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 2b) ใบที่ 3 → trigger จับทันทีในคำสั่งเดียวกัน ได้ 1 ใบของกิจกรรม (ไม่ใช่ใบก่อนเปิด)';

  ---------------------------------------------------------------------------
  -- 3) จับแล้วสร้างกระทงเพิ่ม / cron เรียกซ้ำ → ไม่จับซ้ำ
  for i in 1..10 loop
    insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบหลังจับ' || i, 'x', 'ice', '{}') returning id into extra;
    r := public.run_lucky_draw();
  end loop;
  select count(*) into n from public.lucky_draws;
  ok := n = 1 and (select krathong_id from public.lucky_draws) = winner;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || format(' 3) จับแล้ว สร้างเพิ่ม 10 ใบ + เรียกซ้ำ → ยังมี %s แถว ผู้ชนะเดิม', n);

  -- 4) insert แถวที่สองตรงๆ → ต้องถูกปฏิเสธ
  begin
    insert into public.lucky_draws (krathong_id) values (extra);
    ok := false;
  exception when unique_violation then
    ok := true;
  end;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 4) insert แถวที่สองเข้า lucky_draws → ปฏิเสธ (unique_violation)';

  ---------------------------------------------------------------------------
  -- 5) cron สำรอง: ครบ threshold แต่ trigger ไม่ได้จับ (จำลองบันทึกพร้อมกัน) → run_lucky_draw จับให้
  delete from public.lucky_draws;
  alter table public.krathongs disable trigger krathongs_lucky_draw;
  update public.krathongs set created_at = now() - interval '2 minutes' where created_at >= now() - interval '1 minute';
  insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบพร้อมกัน1', 'x', 'ice', '{}');
  insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบพร้อมกัน2', 'x', 'ice', '{}');
  insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบพร้อมกัน3', 'x', 'ice', '{}');
  alter table public.krathongs enable trigger krathongs_lucky_draw;
  select count(*) into n from public.lucky_draws;
  r := public.run_lucky_draw();
  ok := n = 0 and r is not null and (select count(*) from public.lucky_draws) = 1;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 5) trigger พลาด (บันทึกพร้อมกัน) → รอบ cron (run_lucky_draw) จับให้';

  ---------------------------------------------------------------------------
  -- 6) สุ่มจริง: กระทงของกิจกรรม 3 ใบ จับใหม่ 300 ครั้ง ทุกใบต้องเคยชนะ (≥60)
  select jsonb_object_agg(id::text, 0) into counts from public.krathongs where created_at >= now() - interval '1 minute';
  for i in 1..300 loop
    delete from public.lucky_draws;
    r := public.run_lucky_draw();
    counts := jsonb_set(counts, array[r::text], to_jsonb((counts ->> r::text)::int + 1));
  end loop;
  select min(v::int) into n from jsonb_each_text(counts) as e(k, v);
  ok := n >= 60 and (select count(*) from jsonb_object_keys(counts)) = 3;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || format(' 6) สุ่ม 300 ครั้ง ผลต่อใบ %s (ต่ำสุด ≥60)', counts::text);

  ---------------------------------------------------------------------------
  -- 7) get_lucky_draw_state: มี draw_id / hold 120 / ไม่มีคำอธิษฐาน
  st := public.get_lucky_draw_state();
  ok := (st ->> 'draw_id')::uuid = (select id from public.lucky_draws) and (st ->> 'hold_seconds')::int = 120
    and (st -> 'krathong' -> 'wish') is null and (st ->> 'server_now') is not null;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 7) get_lucky_draw_state คืน draw_id, hold 120, ผู้ชนะ (ไม่มีคำอธิษฐาน)';

  ---------------------------------------------------------------------------
  -- 8) สิทธิ์ / trigger / cron
  ok := not has_function_privilege('anon', 'public.run_lucky_draw(timestamptz)', 'execute')
    and has_function_privilege('anon', 'public.get_lucky_draw_state()', 'execute')
    and exists (select 1 from pg_trigger where tgname = 'krathongs_lucky_draw' and tgenabled = 'O')
    and exists (select 1 from cron.job where jobname = 'run-lucky-draw' and schedule = '10 seconds' and active);
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 8) anon เรียก run_lucky_draw ไม่ได้ / trigger เปิดอยู่ / cron สำรองทุก 10 วินาที';

  ---------------------------------------------------------------------------
  -- 9) การจับผิดพลาด → บันทึกกระทงยังสำเร็จ (แทน run_lucky_draw ด้วยตัวที่ error ชั่วคราว ย้อนกลับตอนจบ)
  delete from public.lucky_draws;
  execute $f$create or replace function public.run_lucky_draw(p_now timestamptz default now()) returns uuid
             language plpgsql security definer set search_path = '' as $b$ begin raise exception 'จำลองการจับพัง'; end; $b$ $f$;
  begin
    insert into public.krathongs (name, wish, krathong_type, decorations) values ('ทดสอบตอนจับพัง', 'x', 'ice', '{}');
    ins_ok := true;
  exception when others then
    ins_ok := false;
  end;
  ok := ins_ok and exists (select 1 from public.krathongs where name = 'ทดสอบตอนจับพัง') and not exists (select 1 from public.lucky_draws);
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 9) run_lucky_draw error → บันทึกกระทงยังสำเร็จ (ไม่มีผลการจับ)';

  raise exception 'TEST REPORT (ไม่ใช่ error จริง: ย้อนข้อมูลทดสอบทั้งหมดแล้ว)%', report
    || E'\n\n' || case when fails = 0 then 'ALL PASSED' else fails || ' FAILED' end;
end;
$$;
