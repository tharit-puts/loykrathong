-- =====================================================================
-- เจ้าแม่คงคาประกาศผู้โชคดี (Lucky Draw): จับครั้งเดียว ผู้ชนะ 1 คน ตัดสินที่ server เท่านั้น
-- รันหลัง migration เด็กเก็บเหรียญ: SQL Editor > New query > วางทั้งไฟล์ > Run (รันซ้ำได้)
--
-- ⚠️ อย่าเปิด enabled ระหว่างทดสอบบน database จริงแล้วทิ้งไว้ — สิทธิ์จับครั้งเดียวจะถูกใช้ไป
--    เปิดกิจกรรมจริง: delete from public.lucky_draws;
--                    update public.lucky_draw_config set enabled = true, enabled_at = now();
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ค่าตั้ง (แถวเดียว id = 1) — แอดมินแก้ผ่าน SQL Editor เท่านั้น
--    delay_seconds = จับหลังกระทงใบแรกของกิจกรรมผ่านไปกี่วินาที
--    hold_seconds  = เจ้าแม่ค้างบนจอกี่วินาที (หลังช่วงผุด ~7 วินาที ก่อนจางหาย 4 วินาที)
-- ---------------------------------------------------------------------
create table if not exists public.lucky_draw_config (
  id            int         primary key default 1 check (id = 1),
  enabled       boolean     not null default false,
  enabled_at    timestamptz,
  delay_seconds int         not null default 120 check (delay_seconds >= 0),
  hold_seconds  int         not null default 300 check (hold_seconds > 0)
);
insert into public.lucky_draw_config (id) values (1) on conflict (id) do nothing;

alter table public.lucky_draw_config enable row level security;
revoke all on public.lucky_draw_config from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) ผลการจับ: มีได้ไม่เกิน 1 แถวทั้งตาราง (unique index บนนิพจน์คงที่)
--    ลบกระทงที่ชนะไม่ได้จนกว่าจะลบแถวนี้ก่อน (foreign key) — กันการจับใหม่โดยไม่ตั้งใจ
-- ---------------------------------------------------------------------
create table if not exists public.lucky_draws (
  id          uuid        primary key default gen_random_uuid(),
  krathong_id uuid        not null unique references public.krathongs (id),
  drawn_at    timestamptz not null default now()
);
create unique index if not exists lucky_draws_only_one on public.lucky_draws ((true));

-- RLS: ทุกคนอ่านได้ (ใช้แสดงผล + Realtime) / เขียนไม่ได้ (ไม่มี policy INSERT/UPDATE/DELETE + ถอนสิทธิ์)
alter table public.lucky_draws enable row level security;
drop policy if exists "lucky_draws: anyone can read" on public.lucky_draws;
create policy "lucky_draws: anyone can read" on public.lucky_draws for select to anon, authenticated using (true);
revoke all on public.lucky_draws from anon, authenticated;
grant select on public.lucky_draws to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) จับผู้โชคดี (cron เรียกทุก 10 วินาที) — ทำงานจริงครั้งเดียวตลอดไป
--    p_now ใช้จำลองเวลาในไฟล์ทดสอบ (cron ใช้ค่าเริ่มต้น now())
--    คืน id กระทงที่ชนะ หรือ null ถ้ารอบนี้ไม่ได้จับ
-- ---------------------------------------------------------------------
create or replace function public.run_lucky_draw(p_now timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg    public.lucky_draw_config;
  v_first  timestamptz;
  v_winner uuid;
begin
  select * into v_cfg from public.lucky_draw_config where id = 1;
  -- 1. ยังไม่เปิดกิจกรรม
  if not found or not v_cfg.enabled or v_cfg.enabled_at is null then
    return null;
  end if;
  -- 2. จับไปแล้ว
  if exists (select 1 from public.lucky_draws) then
    return null;
  end if;
  -- 3. กระทงใบแรกของกิจกรรมต้องผ่านไป delay_seconds แล้ว
  select min(k.created_at) into v_first from public.krathongs k where k.created_at >= v_cfg.enabled_at;
  if v_first is null or p_now < v_first + make_interval(secs => v_cfg.delay_seconds) then
    return null;
  end if;
  -- 4. สุ่ม 1 ใบจากกระทงทั้งหมดของกิจกรรม ณ ตอนนี้ (รวมกระทงล่องหน)
  select k.id into v_winner
    from public.krathongs k
   where k.created_at >= v_cfg.enabled_at and k.created_at <= p_now
   order by random()
   limit 1;
  insert into public.lucky_draws (krathong_id, drawn_at) values (v_winner, p_now)
  on conflict do nothing
  returning krathong_id into v_winner;
  return v_winner;
end;
$$;

revoke all on function public.run_lucky_draw(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) สถานะสำหรับหน้าเว็บ (anon เรียกได้): เวลา server + ผลการจับ + ข้อมูลกระทงผู้ชนะ
--    ไม่ส่งคำอธิษฐานของผู้ชนะ / ไม่เปิดค่าตั้งอื่นนอกจาก hold_seconds
-- ---------------------------------------------------------------------
create or replace function public.get_lucky_draw_state()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'server_now', now(),
    'hold_seconds', coalesce((select c.hold_seconds from public.lucky_draw_config c where c.id = 1), 300),
    'drawn_at', d.drawn_at,
    'krathong', case when d.id is null then null else json_build_object(
      'id', k.id,
      'name', k.name,
      'krathong_type', k.krathong_type,
      'decorations', k.decorations,
      'coin_collected_at', k.coin_collected_at
    ) end
  )
  from (select 1) as one
  left join public.lucky_draws d on true
  left join public.krathongs k on k.id = d.krathong_id;
$$;

revoke all on function public.get_lucky_draw_state() from public;
grant execute on function public.get_lucky_draw_state() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Realtime: แจ้งทุกเครื่องเมื่อมีการจับ (และเมื่อแอดมินลบผลเพื่อรีเซ็ต)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lucky_draws'
  ) then
    alter publication supabase_realtime add table public.lucky_draws;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) pg_cron ทุก 10 วินาที (ชื่องานเดิม = อัปเดตงานเดิม)
-- ---------------------------------------------------------------------
select cron.schedule('run-lucky-draw', '10 seconds', $$select public.run_lucky_draw()$$);
