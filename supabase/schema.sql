-- =====================================================================
-- ลอยกระทงออนไลน์ MODENA: ตารางเก็บกระทง + Row Level Security
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
-- รันซ้ำได้ (ไม่ลบข้อมูลเดิม): ใช้ if not exists / drop ... if exists ทุกจุด
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ตรวจของตกแต่ง: มีได้เฉพาะ flowers / coin10 / nail, ไม่ซ้ำกัน, ไม่มี null
--    (CHECK ใช้ subquery ไม่ได้ จึงแยกเป็นฟังก์ชัน immutable)
-- ---------------------------------------------------------------------
create or replace function public.krathong_decorations_valid(decos text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select decos is not null
     and decos <@ array['flowers', 'coin10', 'nail']::text[]
     and array_position(decos, null) is null
     and cardinality(decos) = (select count(distinct d) from unnest(decos) as d);
$$;

-- ---------------------------------------------------------------------
-- 2) ตาราง krathongs
--    ความยาวสูงสุดตรงกับช่องกรอกในหน้าเว็บ (NAME_MAX = 20, WISH_MAX = 140 ใน src/types.ts)
--    ถ้าแก้ตัวเลขฝั่งเว็บ ต้องแก้ที่นี่ด้วย
-- ---------------------------------------------------------------------
create table if not exists public.krathongs (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text        not null,
  wish          text        not null,
  krathong_type text        not null,
  decorations   text[]      not null default '{}',
  -- แถวบนแม่น้ำ (0 บน / 1 กลาง / 2 ล่าง) และจุดตกลงน้ำ (สัดส่วนความกว้าง 0–1)
  -- เว็บสุ่มให้ตอนสร้างโดยเว้นระยะจากกระทงใบอื่น ทุกเครื่องจะเห็นตำแหน่งเดียวกัน (ว่างได้)
  lane          smallint,
  landing_x     real,

  constraint krathongs_name_length check (char_length(btrim(name)) between 1 and 20),
  constraint krathongs_wish_length check (char_length(btrim(wish)) between 1 and 140),
  constraint krathongs_type_valid  check (krathong_type in ('banana_leaf', 'ice', 'bread', 'invisible')),
  constraint krathongs_decorations_valid check (public.krathong_decorations_valid(decorations)),
  constraint krathongs_lane_valid  check (lane is null or lane between 0 and 2),
  constraint krathongs_landing_x_valid check (landing_x is null or (landing_x >= 0 and landing_x <= 1))
);

comment on table public.krathongs is 'กระทงที่ผู้ใช้ลอย (ทุกคนอ่านได้ / สร้างได้ / แก้-ลบไม่ได้)';

-- เรียงใหม่สุดก่อน: ใช้ทั้งแม่น้ำ (ใบล่าสุด) และหน้ารวมคำอธิษฐาน (แบ่งหน้า)
create index if not exists krathongs_created_at_idx on public.krathongs (created_at desc, id desc);

-- ---------------------------------------------------------------------
-- 3) Row Level Security
--    anon (ผู้เข้าเว็บทั่วไป): อ่านได้ + สร้างได้ / ไม่มี policy UPDATE, DELETE → ถูกบล็อกทั้งหมด
-- ---------------------------------------------------------------------
alter table public.krathongs enable row level security;

drop policy if exists "krathongs: anyone can read" on public.krathongs;
create policy "krathongs: anyone can read"
  on public.krathongs
  for select
  to anon, authenticated
  using (true);

drop policy if exists "krathongs: anyone can create" on public.krathongs;
create policy "krathongs: anyone can create"
  on public.krathongs
  for insert
  to anon, authenticated
  with check (true);  -- ความถูกต้องของข้อมูลตรวจด้วย CHECK constraint ข้างบน

-- ---------------------------------------------------------------------
-- 4) สิทธิ์ระดับคอลัมน์ (ป้องกันอีกชั้น นอกจาก RLS)
--    - สร้างได้เฉพาะคอลัมน์ที่ผู้ใช้กรอก: id และ created_at ให้ฐานข้อมูลตั้งเองเสมอ (ปลอมเวลา/id ไม่ได้)
--    - ถอนสิทธิ์ UPDATE / DELETE / TRUNCATE (TRUNCATE ไม่ผ่าน RLS จึงต้องถอนตรงนี้)
-- ---------------------------------------------------------------------
revoke all on public.krathongs from anon, authenticated;
grant select on public.krathongs to anon, authenticated;
grant insert (name, wish, krathong_type, decorations, lane, landing_x) on public.krathongs to anon, authenticated;
