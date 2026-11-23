-- =====================================================================
-- ทดสอบ collect_one_coin() แบบจำลองเวลา (ไม่ต้องรอจริง)
-- วิธีใช้: SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- ⚠️ ผลลัพธ์จะขึ้นเป็น "ERROR: TEST REPORT ..." โดยตั้งใจ
--    การ raise exception ตอนจบทำให้ทุกอย่างที่ทดสอบถูกย้อนกลับทั้งหมด (ไม่มีแถวทดสอบค้าง ไม่กระทบกระทงจริง)
--    อ่านผลในข้อความ: ทุกบรรทัดต้องขึ้น PASS และบรรทัดสุดท้ายต้องเป็น "ALL PASSED"
-- =====================================================================
do $$
declare
  t0      timestamptz := now() + interval '1 day';   -- เวลาจำลอง (อนาคต กันชนกับข้อมูลจริง)
  report  text := '';
  fails   int := 0;
  r       uuid;
  a uuid; b uuid; c uuid; nocoin uuid; young uuid; done uuid;
  hits_a int := 0; hits_b int := 0; hits_c int := 0;
  collected int;
  i int;

  -- ช่วยบันทึกผล
  procedure_ok boolean;
begin
  -- กันกระทงจริงที่มีสิทธิ์ไม่ให้ถูกเลือกระหว่างทดสอบ (ย้อนกลับตอนจบ)
  update public.krathongs set coin_collected_at = '1900-01-01' where coin_collected_at is null;
  update public.coin_collector_state set last_roll_at = null where id;

  -- กระทงทดสอบ (สร้างย้อนหลังด้วยเวลาจำลอง)
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบA', 'x', 'ice', '{coin10}', t0 - interval '10 minutes') returning id into a;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบB', 'x', 'bread', '{flowers,coin10}', t0 - interval '10 minutes') returning id into b;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบC', 'x', 'banana_leaf', '{coin10,nail}', t0 - interval '10 minutes') returning id into c;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบไม่มีเหรียญ', 'x', 'ice', '{flowers,nail}', t0 - interval '10 minutes') returning id into nocoin;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบยังไม่ครบ2นาที', 'x', 'ice', '{coin10}', t0 - interval '119 seconds') returning id into young;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at, coin_collected_at)
  values ('ทดสอบเก็บแล้ว', 'x', 'ice', '{coin10}', t0 - interval '10 minutes', t0 - interval '1 hour') returning id into done;

  ---------------------------------------------------------------------------
  -- 1) สุ่มแบบเท่าๆ กัน: 3 ใบมีสิทธิ์ สุ่ม 300 รอบ (รีเซ็ตทุกรอบ, โอกาส 100%) แต่ละใบควรได้ ~100
  for i in 1..300 loop
    update public.krathongs set coin_collected_at = null where id in (a, b, c);
    update public.coin_collector_state set last_roll_at = null where id;
    r := public.collect_one_coin(t0, 1.0);
    if r = a then hits_a := hits_a + 1; elsif r = b then hits_b := hits_b + 1; elsif r = c then hits_c := hits_c + 1;
    else fails := fails + 1; report := report || E'\nFAIL สุ่มได้กระทงที่ไม่มีสิทธิ์: ' || coalesce(r::text, 'null'); end if;
  end loop;
  procedure_ok := least(hits_a, hits_b, hits_c) >= 60;
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end
    || format(' 1) สุ่มเท่าๆ กัน A=%s B=%s C=%s (ต่ำสุดต้อง ≥60 จาก 300)', hits_a, hits_b, hits_c);

  ---------------------------------------------------------------------------
  -- 2) ไม่เคยเลือกกระทงไม่มีเหรียญ / ยังไม่ครบ 2 นาที / เก็บแล้ว (จากข้อ 1 ทั้ง 300 รอบ)
  procedure_ok := hits_a + hits_b + hits_c = 300;
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end
    || ' 2) 300 รอบเลือกแต่ A/B/C (ไม่เคยเลือกใบไม่มีเหรียญ, ใบอายุ 119 วิ, ใบที่เก็บแล้ว)';

  ---------------------------------------------------------------------------
  -- 3) รอบละ 1 ใบ: ทั้ง 3 ใบมีสิทธิ์ เรียก 1 ครั้ง → ถูกเก็บ 1 ใบ
  update public.krathongs set coin_collected_at = null where id in (a, b, c);
  update public.coin_collector_state set last_roll_at = null where id;
  r := public.collect_one_coin(t0, 1.0);
  select count(*) into collected from public.krathongs where id in (a, b, c) and coin_collected_at is not null;
  procedure_ok := r is not null and collected = 1;
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || format(' 3) เรียก 1 ครั้งเก็บ %s ใบ (ต้อง = 1)', collected);

  ---------------------------------------------------------------------------
  -- 4) cooldown: หลังเก็บที่ t0, ที่ +60 วิ และ +109 วิ ต้องไม่เก็บ / +110 วิ ต้องเก็บได้
  r := public.collect_one_coin(t0 + interval '60 seconds', 1.0);
  procedure_ok := r is null;
  r := public.collect_one_coin(t0 + interval '109 seconds', 1.0);
  procedure_ok := procedure_ok and r is null;
  select count(*) into collected from public.krathongs where id in (a, b, c) and coin_collected_at is not null;
  procedure_ok := procedure_ok and collected = 1;
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || ' 4a) ภายใน cooldown (+60, +109 วิ) ไม่มีการเก็บ';

  r := public.collect_one_coin(t0 + interval '110 seconds', 1.0);
  procedure_ok := r is not null;
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || ' 4b) ครบ 110 วิ เก็บรอบถัดไปได้ (ไม่ถูกข้ามแม้ cron คลาดเสี้ยววินาที)';

  -- จำลอง cron ทุก 1 นาทีที่คลาดเล็กน้อย (+0.3 วิ ทุกนาที) 10 นาที → ต้องเก็บทุก 2 นาที = 5 ครั้ง
  update public.krathongs set coin_collected_at = null where id in (a, b, c);
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  select 'ทดสอบเพิ่ม' || g, 'x', 'ice', '{coin10}', t0 - interval '10 minutes' from generate_series(1, 5) g;
  update public.coin_collector_state set last_roll_at = null where id;
  collected := 0;
  for i in 0..9 loop
    r := public.collect_one_coin(t0 + interval '1 hour' + make_interval(mins => i, secs => 0.3 * i), 1.0);
    if r is not null then collected := collected + 1; end if;
  end loop;
  procedure_ok := collected = 5;
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || format(' 4c) cron ทุกนาที (คลาด 0.3 วิ/นาที) 10 นาที เก็บ %s ครั้ง (ต้อง = 5)', collected);

  ---------------------------------------------------------------------------
  -- 5) ไม่เก็บซ้ำ: ใบที่เก็บแล้วไม่ถูกเลือกอีก (เหลือ 0 ใบมีสิทธิ์ → null และไม่นับเป็นรอบ)
  update public.krathongs set coin_collected_at = t0 where coin_collected_at is null;
  update public.coin_collector_state set last_roll_at = null where id;
  r := public.collect_one_coin(t0 + interval '2 hours', 1.0);
  procedure_ok := r is null and (select last_roll_at is null from public.coin_collector_state where id);
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || ' 5) ไม่มีกระทงมีสิทธิ์ → ไม่เก็บซ้ำ และไม่นับเป็นรอบ';

  ---------------------------------------------------------------------------
  -- 6) โอกาส 70%: 1000 รอบ ควรเก็บได้ราว 700 (ยอมรับ 640–760)
  collected := 0;
  for i in 1..1000 loop
    update public.krathongs set coin_collected_at = null where id = a;
    update public.coin_collector_state set last_roll_at = null where id;
    r := public.collect_one_coin(t0 + interval '3 hours');
    if r is not null then collected := collected + 1; end if;
  end loop;
  procedure_ok := collected between 640 and 760;
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || format(' 6) โอกาสเริ่มต้น 70%%: 1000 รอบ เก็บได้ %s', collected);

  ---------------------------------------------------------------------------
  -- 7) สิทธิ์: anon/authenticated เรียกฟังก์ชันไม่ได้ / cron ตั้งไว้แล้ว / realtime เปิดแล้ว
  procedure_ok := not has_function_privilege('anon', 'public.collect_one_coin(timestamptz, double precision, interval, interval)', 'execute')
              and not has_function_privilege('authenticated', 'public.collect_one_coin(timestamptz, double precision, interval, interval)', 'execute');
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || ' 7a) anon/authenticated ไม่มีสิทธิ์ execute collect_one_coin';

  procedure_ok := not has_table_privilege('anon', 'public.krathongs', 'update') and not has_table_privilege('anon', 'public.coin_collector_state', 'select');
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || ' 7b) anon ไม่มีสิทธิ์ UPDATE krathongs และอ่าน coin_collector_state ไม่ได้';

  procedure_ok := exists (select 1 from cron.job where jobname = 'collect-one-coin' and schedule = '* * * * *' and active);
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || ' 7c) cron job collect-one-coin ทุก 1 นาที active';

  procedure_ok := exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'krathongs');
  if not procedure_ok then fails := fails + 1; end if;
  report := report || E'\n' || case when procedure_ok then 'PASS' else 'FAIL' end || ' 7d) ตาราง krathongs อยู่ใน supabase_realtime';

  raise exception 'TEST REPORT (ไม่ใช่ error จริง: ย้อนข้อมูลทดสอบทั้งหมดแล้ว)%', report
    || E'\n\n' || case when fails = 0 then 'ALL PASSED' else fails || ' FAILED' end;
end;
$$;
