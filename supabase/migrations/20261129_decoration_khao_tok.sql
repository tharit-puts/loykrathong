-- =====================================================================
-- เพิ่มของตกแต่ง "ข้าวตอก" (khao_tok) — ให้ชีวิตมั่นคงมีการงานที่ดี
-- รันหลัง migration อื่นทั้งหมด: SQL Editor > New query > วางทั้งไฟล์ > Run (รันซ้ำได้)
--
-- CHECK ของคอลัมน์ decorations เรียกฟังก์ชันนี้ → แก้รายการค่าที่ยอมรับที่นี่ที่เดียว
-- (แถวเดิมไม่กระทบ: ค่าเดิมทั้งหมดยังอยู่ในรายการ)
-- =====================================================================
create or replace function public.krathong_decorations_valid(decos text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select decos is not null
     and decos <@ array['flowers', 'coin10', 'nail', 'khao_tok']::text[]
     and array_position(decos, null) is null
     and cardinality(decos) = (select count(distinct d) from unnest(decos) as d);
$$;
