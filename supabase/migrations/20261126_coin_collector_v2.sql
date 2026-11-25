-- =====================================================================
-- เด็กเก็บเหรียญ v2: ถี่ขึ้น (ทุก 20 วินาที) + เก็บทุกครั้งที่ครบเวลา (ไม่สุ่ม) + ค่าตั้งอยู่ในตาราง config ที่เดียว
-- รันหลัง 20261124_coin_collector.sql: SQL Editor > New query > วางทั้งไฟล์ > Run (รันซ้ำได้)
--
-- ปรับค่าภายหลังไม่ต้องแก้ฟังก์ชัน เช่น
--   update public.coin_collector_config set chance = 0.8;
--   update public.coin_collector_config set min_age = interval '30 seconds', cooldown = interval '30 seconds';
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) pg_cron ต้องเป็น 1.5 ขึ้นไป ถึงจะตั้งรอบเป็นวินาทีได้ ('10 seconds')
--    ถ้าต่ำกว่า: หยุดพร้อมข้อความ (ไม่แก้อะไรเลย) → ต้องเปลี่ยนไปใช้ Edge Function + schedule แทน
-- ---------------------------------------------------------------------
do $$
declare
  v text := (select extversion from pg_extension where extname = 'pg_cron');
begin
  if v is null then
    raise exception 'ยังไม่ได้เปิด pg_cron: Dashboard > Integrations > Cron (หรือ Database > Extensions) แล้วรันใหม่';
  end if;
  if string_to_array(split_part(v, '-', 1), '.')::int[] < array[1, 5] then
    raise exception 'pg_cron เวอร์ชัน % ไม่รองรับรอบแบบวินาที (ต้อง 1.5 ขึ้นไป)', v;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1) ค่าตั้ง (แถวเดียว) — แก้ตรงนี้ที่เดียว
--    chance   = โอกาสที่เด็กจะโผล่ในรอบที่มีกระทงมีสิทธิ์ (0–1) — ค่าเริ่มต้น 1 = ครบเวลาแล้วเก็บเลย ไม่สุ่ม
--    min_age  = กระทงต้องสร้างมาแล้วอย่างน้อยเท่านี้ (เวลา server)
--    cooldown = ระยะห่างขั้นต่ำระหว่างรอบ (ต้องยาวกว่าแอนิเมชันเด็ก 5 วินาที ไม่งั้นเด็กสองรอบจะซ้อนกัน)
-- ---------------------------------------------------------------------
create table if not exists public.coin_collector_config (
  id       boolean          primary key default true check (id),
  chance   double precision not null default 1 check (chance between 0 and 1),
  min_age  interval         not null default interval '20 seconds',
  cooldown interval         not null default interval '20 seconds' check (cooldown >= interval '5 seconds')
);
insert into public.coin_collector_config (id) values (true) on conflict (id) do nothing;
-- ถ้าเคยรันไฟล์นี้ตอนค่าเริ่มต้นยังเป็น 0.9: เปลี่ยนเป็นเก็บทุกครั้ง (รันซ้ำไม่มีผลกับค่าอื่น)
update public.coin_collector_config set chance = 1 where id and chance = 0.9;

alter table public.coin_collector_config enable row level security;
revoke all on public.coin_collector_config from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) ฟังก์ชันเก็บเหรียญ: อ่านค่าจาก config (พารามิเตอร์ที่ส่งมาเอง ใช้แทนได้ — ไฟล์ทดสอบใช้จำลองเวลา)
--    cron ทุก 10 วินาที + cooldown 20 วินาที:
--    ยอมให้คลาด 2 วินาที (COOLDOWN_SLACK) เพราะ cron แต่ละรอบเริ่มช้า/เร็วกว่ากำหนดได้เสี้ยววินาที
--    ถ้าเทียบ 20 วินาทีเป๊ะ รอบที่มาก่อนนิดเดียวจะถูกข้ามไปเป็น 30 วินาที
--    รอบของ cron ห่างกัน 10 วินาที จึงไม่มีการเก็บที่ 18–19 วินาทีจริง (ระยะห่างจริงคือ 20 วินาที)
-- ---------------------------------------------------------------------
create or replace function public.collect_one_coin(
  p_now      timestamptz      default now(),
  p_chance   double precision default null,
  p_cooldown interval         default null,
  p_min_age  interval         default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  COOLDOWN_SLACK constant interval := interval '2 seconds';
  v_cfg    public.coin_collector_config;
  v_chance double precision;
  v_cool   interval;
  v_age    interval;
  v_last   timestamptz;
  v_target uuid;
begin
  select * into v_cfg from public.coin_collector_config c where c.id;
  v_chance := coalesce(p_chance, v_cfg.chance, 1);
  v_cool   := coalesce(p_cooldown, v_cfg.cooldown, interval '20 seconds');
  v_age    := coalesce(p_min_age, v_cfg.min_age, interval '20 seconds');

  -- lock แถวสถานะ: ถ้ามีการเรียกซ้อนกัน อีกตัวจะรอจนตัวแรกเสร็จ แล้วเห็น cooldown ใหม่
  select s.last_roll_at into v_last
    from public.coin_collector_state s
   where s.id
     for update;

  if v_last is not null and p_now - v_last < v_cool - COOLDOWN_SLACK then
    return null;  -- ยังอยู่ใน cooldown
  end if;

  -- สุ่มกระทงมีสิทธิ์ 1 ใบ (skip locked: ข้ามแถวที่ transaction อื่นกำลังแก้)
  select k.id into v_target
    from public.krathongs k
   where k.coin_collected_at is null
     and 'coin10' = any (k.decorations)
     and k.created_at <= p_now - v_age
   order by random()
   limit 1
     for update skip locked;

  if v_target is null then
    return null;  -- ไม่มีกระทงมีสิทธิ์: ไม่นับเป็นรอบ
  end if;

  -- นับเป็นรอบแล้ว (ไม่ว่าจะสุ่มโอกาสผ่านหรือไม่) → รอบถัดไปต้องรอ cooldown
  update public.coin_collector_state set last_roll_at = p_now where id;

  -- chance = 1 (ค่าเริ่มต้น): ไม่สุ่ม เก็บเลย
  if v_chance < 1 and random() >= v_chance then
    return null;  -- รอบนี้เด็กไม่โผล่
  end if;

  update public.krathongs set coin_collected_at = p_now where id = v_target;
  return v_target;
end;
$$;

revoke all on function public.collect_one_coin(timestamptz, double precision, interval, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) pg_cron ทุก 10 วินาที (ชื่องานเดิม = อัปเดตงานเดิม ไม่สร้างซ้ำ)
-- ---------------------------------------------------------------------
select cron.schedule('collect-one-coin', '10 seconds', $$select public.collect_one_coin()$$);
