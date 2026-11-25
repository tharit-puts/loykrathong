-- =====================================================================
-- ทดสอบ collect_one_coin() แบบจำลองเวลา (ไม่ต้องรอจริง) — ค่าตาม migration v2 (20 วินาที / เก็บทุกครั้ง 100% / cron 10 วินาที)
-- วิธีใช้: SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- ⚠️ ผลลัพธ์จะขึ้นเป็น "ERROR: TEST REPORT ..." โดยตั้งใจ
--    การ raise exception ตอนจบทำให้ทุกอย่างที่ทดสอบถูกย้อนกลับทั้งหมด (ไม่มีแถวทดสอบค้าง ไม่กระทบกระทงจริง/ค่าตั้งจริง)
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
  last_at timestamptz;
  min_gap interval;
  i int;
  ok boolean;
begin
  -- ใช้ค่าตั้งตามที่ migration v2 กำหนด (ย้อนกลับตอนจบ) และกันกระทงจริงไม่ให้ถูกเลือกระหว่างทดสอบ
  update public.coin_collector_config set chance = 1, min_age = interval '20 seconds', cooldown = interval '20 seconds' where id;
  update public.krathongs set coin_collected_at = '1900-01-01' where coin_collected_at is null;
  update public.coin_collector_state set last_roll_at = null where id;

  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบA', 'x', 'ice', '{coin10}', t0 - interval '10 minutes') returning id into a;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบB', 'x', 'bread', '{flowers,coin10}', t0 - interval '10 minutes') returning id into b;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบC', 'x', 'banana_leaf', '{coin10,nail}', t0 - interval '21 seconds') returning id into c;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบไม่มีเหรียญ', 'x', 'ice', '{flowers,nail}', t0 - interval '10 minutes') returning id into nocoin;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  values ('ทดสอบอายุ19วิ', 'x', 'ice', '{coin10}', t0 - interval '19 seconds') returning id into young;
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at, coin_collected_at)
  values ('ทดสอบเก็บแล้ว', 'x', 'ice', '{coin10}', t0 - interval '10 minutes', t0 - interval '1 hour') returning id into done;

  ---------------------------------------------------------------------------
  -- 1) สุ่มเท่าๆ กัน: A, B, C (C อายุ 21 วิ = มีสิทธิ์) สุ่ม 300 รอบ (รีเซ็ตทุกรอบ, โอกาส 100%) แต่ละใบควรได้ ~100
  for i in 1..300 loop
    update public.krathongs set coin_collected_at = null where id in (a, b, c);
    update public.coin_collector_state set last_roll_at = null where id;
    r := public.collect_one_coin(t0, 1.0);
    if r = a then hits_a := hits_a + 1; elsif r = b then hits_b := hits_b + 1; elsif r = c then hits_c := hits_c + 1;
    else fails := fails + 1; report := report || E'\nFAIL สุ่มได้กระทงที่ไม่มีสิทธิ์: ' || coalesce(r::text, 'null'); end if;
  end loop;
  ok := least(hits_a, hits_b, hits_c) >= 60;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end
    || format(' 1) สุ่มเท่าๆ กัน A=%s B=%s C=%s (ต่ำสุดต้อง ≥60 จาก 300)', hits_a, hits_b, hits_c);

  -- 2) ไม่เคยเลือกใบไม่มีเหรียญ / อายุ 19 วิ / เก็บแล้ว
  ok := hits_a + hits_b + hits_c = 300;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end
    || ' 2) 300 รอบเลือกแต่ A/B/C (ไม่เคยเลือกใบไม่มีเหรียญ, ใบอายุ 19 วิ, ใบที่เก็บแล้ว)';

  ---------------------------------------------------------------------------
  -- 3) รอบละ 1 ใบ
  update public.krathongs set coin_collected_at = null where id in (a, b, c);
  update public.coin_collector_state set last_roll_at = null where id;
  r := public.collect_one_coin(t0, 1.0);
  select count(*) into collected from public.krathongs where id in (a, b, c) and coin_collected_at is not null;
  ok := r is not null and collected = 1;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || format(' 3) เรียก 1 ครั้งเก็บ %s ใบ (ต้อง = 1)', collected);

  ---------------------------------------------------------------------------
  -- 4a) cooldown 20 วิ: รอบ cron ถัดไป (+10 วิ) ต้องไม่เก็บ / +20 วิ เก็บได้
  r := public.collect_one_coin(t0 + interval '10 seconds', 1.0);
  ok := r is null;
  select count(*) into collected from public.krathongs where id in (a, b, c) and coin_collected_at is not null;
  ok := ok and collected = 1;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 4a) ภายใน 20 วิหลังเก็บ (รอบ cron +10 วิ) ไม่มีการเก็บ';

  r := public.collect_one_coin(t0 + interval '20 seconds', 1.0);
  ok := r is not null;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 4b) ครบ 20 วิ เก็บรอบถัดไปได้';

  -- 4c) จำลอง cron ทุก 10 วิที่คลาด (−0.4 ถึง +0.4 วิ) 200 วินาที → ต้องเก็บทุก 20 วิ = 10 ครั้ง
  --     และระยะห่างระหว่างการเก็บต้องไม่ต่ำกว่า 19 วิ (ไม่มีรอบถูกข้าม ไม่มีรอบซ้อน)
  insert into public.krathongs (name, wish, krathong_type, decorations, created_at)
  select 'ทดสอบเพิ่ม' || g, 'x', 'ice', '{coin10}', t0 - interval '10 minutes' from generate_series(1, 12) g;
  update public.krathongs set coin_collected_at = null where id in (a, b, c);
  update public.coin_collector_state set last_roll_at = null where id;
  collected := 0; last_at := null; min_gap := interval '1 hour';
  for i in 0..19 loop
    r := public.collect_one_coin(t0 + interval '1 hour' + make_interval(secs => i * 10 + case when i % 2 = 0 then 0.4 else -0.4 end), 1.0);
    if r is not null then
      collected := collected + 1;
      if last_at is not null then
        min_gap := least(min_gap, (t0 + interval '1 hour' + make_interval(secs => i * 10 + case when i % 2 = 0 then 0.4 else -0.4 end)) - last_at);
      end if;
      last_at := t0 + interval '1 hour' + make_interval(secs => i * 10 + case when i % 2 = 0 then 0.4 else -0.4 end);
    end if;
  end loop;
  ok := collected = 10 and min_gap >= interval '19 seconds';
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end
    || format(' 4c) cron ทุก 10 วิ (คลาด ±0.4 วิ) 200 วิ เก็บ %s ครั้ง (ต้อง = 10), ห่างกันอย่างน้อย %s', collected, min_gap);

  ---------------------------------------------------------------------------
  -- 5) ไม่เก็บซ้ำ: ไม่มีกระทงมีสิทธิ์ → null และไม่นับเป็นรอบ
  update public.krathongs set coin_collected_at = t0 where coin_collected_at is null;
  update public.coin_collector_state set last_roll_at = null where id;
  r := public.collect_one_coin(t0 + interval '2 hours', 1.0);
  ok := r is null and (select last_roll_at is null from public.coin_collector_state where id);
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 5) ไม่มีกระทงมีสิทธิ์ → ไม่เก็บซ้ำ และไม่นับเป็นรอบ';

  ---------------------------------------------------------------------------
  -- 6a) ค่าเริ่มต้นจาก config (100%): ครบเวลาแล้วเก็บทุกครั้ง 1000/1000 รอบ
  collected := 0;
  for i in 1..1000 loop
    update public.krathongs set coin_collected_at = null where id = a;
    update public.coin_collector_state set last_roll_at = null where id;
    r := public.collect_one_coin(t0 + interval '3 hours');
    if r is not null then collected := collected + 1; end if;
  end loop;
  ok := collected = 1000;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || format(' 6a) config เก็บทุกครั้ง (100%%): 1000 รอบ เก็บได้ %s (ต้อง = 1000)', collected);

  -- 6b) แก้ค่าใน config แล้วฟังก์ชันใช้ค่าใหม่ทันที (ตั้ง 0 = ไม่มีวันโผล่)
  update public.coin_collector_config set chance = 0 where id;
  collected := 0;
  for i in 1..50 loop
    update public.krathongs set coin_collected_at = null where id = a;
    update public.coin_collector_state set last_roll_at = null where id;
    r := public.collect_one_coin(t0 + interval '4 hours');
    if r is not null then collected := collected + 1; end if;
  end loop;
  ok := collected = 0;
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || format(' 6b) แก้ config chance = 0 → 50 รอบ เก็บได้ %s (ต้อง = 0)', collected);
  update public.coin_collector_config set chance = 1 where id;

  ---------------------------------------------------------------------------
  -- 7) สิทธิ์ / cron / realtime
  ok := not has_function_privilege('anon', 'public.collect_one_coin(timestamptz, double precision, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.collect_one_coin(timestamptz, double precision, interval, interval)', 'execute');
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 7a) anon/authenticated ไม่มีสิทธิ์ execute collect_one_coin';

  ok := not has_table_privilege('anon', 'public.krathongs', 'update')
    and not has_table_privilege('anon', 'public.coin_collector_state', 'select')
    and not has_table_privilege('anon', 'public.coin_collector_config', 'select')
    and not has_table_privilege('anon', 'public.coin_collector_config', 'update');
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 7b) anon แก้ krathongs ไม่ได้ และอ่าน/แก้ตารางสถานะ/config ไม่ได้';

  ok := exists (select 1 from cron.job where jobname = 'collect-one-coin' and schedule = '10 seconds' and active);
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 7c) cron job collect-one-coin ทุก 10 วินาที active';

  ok := exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'krathongs');
  if not ok then fails := fails + 1; end if;
  report := report || E'\n' || case when ok then 'PASS' else 'FAIL' end || ' 7d) ตาราง krathongs อยู่ใน supabase_realtime';

  raise exception 'TEST REPORT (ไม่ใช่ error จริง: ย้อนข้อมูลทดสอบทั้งหมดแล้ว)%', report
    || E'\n\n' || case when fails = 0 then 'ALL PASSED' else fails || ' FAILED' end;
end;
$$;
