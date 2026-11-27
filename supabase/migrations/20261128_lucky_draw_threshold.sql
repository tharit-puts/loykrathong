-- =====================================================================
-- เจ้าแม่คงคา v2: จับเมื่อกระทงครบ draw_threshold ใบ (ค่าเริ่มต้น 12) แทน "ใบแรก + รอ 2 นาที"
--                 ค้างบนจอ 120 วินาที (เดิม 300) / ส่ง draw_id ให้หน้าเว็บ (จำการปิดของแต่ละรอบ)
-- รันหลัง 20261127_lucky_draw.sql: SQL Editor > New query > วางทั้งไฟล์ > Run (รันซ้ำได้)
--
-- ⚠️ ห้ามเปิด enabled บน database จริงระหว่างทดสอบแล้วทิ้งไว้ — สิทธิ์จับครั้งเดียวจะถูกใช้ไป
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ค่าตั้งใหม่
--    draw_threshold = จับเมื่อกระทงที่สร้างหลังเปิดกิจกรรม (created_at >= enabled_at) ครบกี่ใบ
--    hold_seconds   = 120
--    delay_seconds  = เลิกใช้แล้ว (เก็บคอลัมน์ไว้ ไม่มีโค้ดเรียกใช้)
-- ---------------------------------------------------------------------
alter table public.lucky_draw_config
  add column if not exists draw_threshold int not null default 12;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lucky_draw_config_draw_threshold_check') then
    alter table public.lucky_draw_config
      add constraint lucky_draw_config_draw_threshold_check check (draw_threshold >= 1);
  end if;
end;
$$;

alter table public.lucky_draw_config alter column hold_seconds set default 120;
update public.lucky_draw_config set hold_seconds = 120 where id = 1 and hold_seconds = 300;

comment on column public.lucky_draw_config.delay_seconds is 'เลิกใช้แล้ว (v2 จับเมื่อครบ draw_threshold ใบ)';
comment on column public.lucky_draw_config.draw_threshold is 'จับเมื่อกระทงที่สร้างหลัง enabled_at ครบกี่ใบ';

-- ---------------------------------------------------------------------
-- 2) จับผู้โชคดี: ครบ draw_threshold ใบ → สุ่ม 1 ใบจากกระทงของกิจกรรมทั้งหมด ณ ตอนนั้น
--    เรียกจาก trigger (ทันทีที่บันทึกกระทง) และ pg_cron ทุก 10 วินาที (ตัวสำรอง)
--    ผู้ชนะซ้ำไม่ได้: unique index บน lucky_draws + on conflict do nothing
-- ---------------------------------------------------------------------
create or replace function public.run_lucky_draw(p_now timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg    public.lucky_draw_config;
  v_count  int;
  v_winner uuid;
begin
  select * into v_cfg from public.lucky_draw_config where id = 1;
  -- ยังไม่เปิดกิจกรรม / จับไปแล้ว → จบทันที
  if not found or not v_cfg.enabled or v_cfg.enabled_at is null then
    return null;
  end if;
  if exists (select 1 from public.lucky_draws) then
    return null;
  end if;

  -- นับเฉพาะกระทงที่สร้างหลังเปิดกิจกรรม
  select count(*) into v_count
    from public.krathongs k
   where k.created_at >= v_cfg.enabled_at and k.created_at <= p_now;
  if v_count < v_cfg.draw_threshold then
    return null;
  end if;

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
-- 3) trigger: บันทึกกระทงแล้วลองจับทันที (ใบที่ครบ threshold จะจับในคำสั่งเดียวกัน)
--    - เช็คเร็ว (ปิดกิจกรรม / จับแล้ว) ก่อน ไม่นับกระทงทุกครั้งที่มีคนสร้าง
--    - ทุกอย่างอยู่ใน exception handler: จับพลาดยังไงการบันทึกกระทงต้องสำเร็จเสมอ
--    - ถ้าใบที่ threshold-1 กับ threshold บันทึกพร้อมกัน ต่างฝ่ายนับได้ไม่ครบ → cron จับให้ภายใน 10 วินาที
--    (ฟังก์ชัน trigger เรียกผ่าน API ตรงๆ ไม่ได้อยู่แล้ว — คืนค่าเป็น trigger)
-- ---------------------------------------------------------------------
create or replace function public.lucky_draw_after_krathong_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if exists (select 1 from public.lucky_draw_config c where c.id = 1 and c.enabled and c.enabled_at is not null)
       and not exists (select 1 from public.lucky_draws) then
      perform public.run_lucky_draw();
    end if;
  exception when others then
    raise warning 'lucky draw (trigger) ล้มเหลว แต่บันทึกกระทงต่อ: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists krathongs_lucky_draw on public.krathongs;
create trigger krathongs_lucky_draw
  after insert on public.krathongs
  for each row execute function public.lucky_draw_after_krathong_insert();

-- ---------------------------------------------------------------------
-- 4) สถานะสำหรับหน้าเว็บ: เพิ่ม draw_id (หน้าเว็บจำว่าผู้ใช้ปิดเจ้าแม่ของรอบนี้ไปแล้ว)
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
    'hold_seconds', coalesce((select c.hold_seconds from public.lucky_draw_config c where c.id = 1), 120),
    'draw_id', d.id,
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

-- pg_cron run-lucky-draw ทุก 10 วินาที (จาก migration เดิม) ใช้ต่อเป็นตัวสำรอง — ตั้งซ้ำเผื่อถูกหยุดไว้
select cron.schedule('run-lucky-draw', '10 seconds', $$select public.run_lucky_draw()$$);
