-- =====================================================================
-- เด็กเก็บเหรียญจากกระทง (Coin Collector Kid)
-- รันหลัง supabase/schema.sql: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
-- รันซ้ำได้ (ไม่ลบข้อมูลเดิม)
--
-- กติกา
-- - pg_cron เรียก collect_one_coin() ทุก 1 นาที
-- - กระทงที่มีสิทธิ์: มี coin10, ยังไม่ถูกเก็บ, สร้างมาแล้วอย่างน้อย 2 นาที (เวลา server)
-- - "รอบ" = ครั้งที่มีกระทงมีสิทธิ์และผ่าน cooldown 110 วินาทีนับจากรอบก่อน (กันรอบถูกข้ามเพราะเวลาคลาดเสี้ยววินาที)
--   ในรอบนั้นสุ่มกระทงมีสิทธิ์ 1 ใบ แล้วสุ่มโอกาส 70% ว่าเด็กจะมาเก็บหรือไม่
--   ไม่มีกระทงมีสิทธิ์ = ไม่นับเป็นรอบ (นาทีถัดไปเช็คใหม่ ถ้ามีกระทงครบ 2 นาทีพอดีจะได้เก็บภายใน 1 นาที)
-- - เก็บแล้วตั้ง coin_collected_at = now() (ไม่ลบ coin10 ออกจาก decorations เก็บไว้ทำสถิติ)
--   เว็บแสดงเหรียญเมื่อ decorations มี coin10 และ coin_collected_at เป็น null
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) คอลัมน์ใหม่ + index สำหรับหากระทงมีสิทธิ์
--    anon ยังสร้าง/แก้คอลัมน์นี้ไม่ได้ (สิทธิ์ INSERT ระดับคอลัมน์ใน schema.sql ไม่รวมคอลัมน์นี้ และไม่มีสิทธิ์ UPDATE)
-- ---------------------------------------------------------------------
alter table public.krathongs add column if not exists coin_collected_at timestamptz;

create index if not exists krathongs_coin_eligible_idx
  on public.krathongs (created_at)
  where coin_collected_at is null and 'coin10' = any (decorations);

-- ---------------------------------------------------------------------
-- 2) สถานะรอบล่าสุด (แถวเดียว) ใช้ทำ cooldown และกันการเรียกซ้อนกัน (lock แถวนี้)
--    ผู้ใช้เว็บอ่าน/เขียนไม่ได้
-- ---------------------------------------------------------------------
create table if not exists public.coin_collector_state (
  id           boolean primary key default true check (id),
  last_roll_at timestamptz
);
insert into public.coin_collector_state (id) values (true) on conflict (id) do nothing;

alter table public.coin_collector_state enable row level security;
revoke all on public.coin_collector_state from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) ฟังก์ชันเก็บเหรียญ 1 รอบ
--    SECURITY DEFINER: ทำงานด้วยสิทธิ์เจ้าของ (postgres) จึงแก้ตาราง krathongs ได้ แม้ไม่มี policy UPDATE
--    พารามิเตอร์มีค่าเริ่มต้นสำหรับ cron; ไฟล์ทดสอบ (supabase/tests) ส่งค่าเองเพื่อจำลองเวลา/โอกาส
--    คืน id กระทงที่ถูกเก็บ หรือ null ถ้ารอบนี้ไม่ได้เก็บ
-- ---------------------------------------------------------------------
create or replace function public.collect_one_coin(
  p_now      timestamptz      default now(),
  p_chance   double precision default 0.7,                 -- โอกาสที่เด็กจะโผล่ในรอบที่มีกระทงมีสิทธิ์ (0–1)
  p_cooldown interval         default interval '110 seconds',
  p_min_age  interval         default interval '2 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last   timestamptz;
  v_target uuid;
begin
  -- lock แถวสถานะ: ถ้ามีการเรียกซ้อนกัน อีกตัวจะรอจนตัวแรกเสร็จ แล้วเห็น cooldown ใหม่
  select s.last_roll_at into v_last
    from public.coin_collector_state s
   where s.id
     for update;

  if v_last is not null and p_now - v_last < p_cooldown then
    return null;  -- ยังอยู่ใน cooldown
  end if;

  -- สุ่มกระทงมีสิทธิ์ 1 ใบ (skip locked: ข้ามแถวที่ transaction อื่นกำลังแก้)
  select k.id into v_target
    from public.krathongs k
   where k.coin_collected_at is null
     and 'coin10' = any (k.decorations)
     and k.created_at <= p_now - p_min_age
   order by random()
   limit 1
     for update skip locked;

  if v_target is null then
    return null;  -- ไม่มีกระทงมีสิทธิ์: ไม่นับเป็นรอบ
  end if;

  -- นับเป็นรอบแล้ว (ไม่ว่าจะสุ่มโอกาสผ่านหรือไม่) → รอบถัดไปต้องรอ cooldown
  update public.coin_collector_state set last_roll_at = p_now where id;

  if random() >= p_chance then
    return null;  -- รอบนี้เด็กไม่โผล่
  end if;

  update public.krathongs set coin_collected_at = p_now where id = v_target;
  return v_target;
end;
$$;

-- ผู้ใช้เว็บ (anon/authenticated) เรียกเองไม่ได้ ให้ cron (postgres) เรียกได้อย่างเดียว
-- (Supabase ให้สิทธิ์ execute ฟังก์ชันใหม่กับ anon/authenticated อัตโนมัติ จึงต้องถอนตรงๆ ทั้ง 3 role)
revoke all on function public.collect_one_coin(timestamptz, double precision, interval, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Realtime: ส่ง event เมื่อแถวใน krathongs เปลี่ยน
--    ผู้ใช้เว็บรับ event ผ่าน RLS SELECT policy เดิม (anon อ่านได้อยู่แล้ว)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'krathongs'
  ) then
    alter publication supabase_realtime add table public.krathongs;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) pg_cron: เรียกทุก 1 นาที (ฟังก์ชันบังคับ cooldown 110 วินาทีเอง จึงเก็บได้ราวทุก 2 นาที)
--    ถ้าบรรทัด create extension ไม่ผ่าน ให้เปิดที่ Dashboard > Integrations > Cron (หรือ Database > Extensions > pg_cron)
--    แล้วรันไฟล์นี้ใหม่
--    cron.schedule ชื่อเดิม = อัปเดตงานเดิม ไม่สร้างซ้ำ
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('collect-one-coin', '* * * * *', $$select public.collect_one_coin()$$);
