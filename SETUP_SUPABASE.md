# ตั้งค่า Supabase สำหรับเว็บลอยกระทง

คู่มือนี้พาตั้งค่าฐานข้อมูลเก็บกระทงตั้งแต่ต้นจนใช้งานได้ ใช้เวลาประมาณ 10 นาที

> **กฎสำคัญ:** ห้ามแปะ key จริงลงในแชท, issue, โค้ด หรือไฟล์ที่ commit ให้ใส่ใน `.env.local` เท่านั้น

## ภาพรวม

| ไฟล์ | หน้าที่ |
| --- | --- |
| `supabase/schema.sql` | สร้างตาราง `krathongs` + CHECK constraint + RLS (รันใน SQL Editor) |
| `.env.example` | template ชื่อตัวแปร (commit ได้) |
| `.env.local` | ค่าจริงของคุณ (**ห้าม commit** ถูก ignore ไว้แล้ว) |
| `src/lib/supabase.ts` | Supabase client ตัวเดียวของทั้งเว็บ |
| `src/services/krathongs.ts` | `createKrathong`, `fetchKrathongs`, `getKrathongCount` |
| `supabase/migrations/20261124_coin_collector.sql` | เด็กเก็บเหรียญ: คอลัมน์ `coin_collected_at`, ฟังก์ชัน `collect_one_coin`, pg_cron, Realtime (ดูข้อ 8) |
| `supabase/migrations/20261126_coin_collector_v2.sql` | เด็กเก็บเหรียญ v2: ตาราง config (20 วินาที / เก็บทุกครั้ง), cron ทุก 10 วินาที (ดูข้อ 8) |
| `supabase/migrations/20261127_lucky_draw.sql` | เจ้าแม่คงคาประกาศผู้โชคดี: ตาราง config/ผล, run_lucky_draw, get_lucky_draw_state, cron, Realtime (ดูข้อ 9) |
| `supabase/tests/lucky_draw_test.sql` | ทดสอบการจับผู้โชคดีแบบจำลองเวลา (รันใน SQL Editor) |
| `supabase/tests/coin_collector_test.sql` | ทดสอบกติกาเก็บเหรียญแบบจำลองเวลา (รันใน SQL Editor) |
| `scripts/test-supabase.mjs` | ทดสอบ schema + RLS ด้วย anon key (`npm run test:supabase`) |

ตาราง `krathongs` เก็บ:

| คอลัมน์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `id` | uuid | ฐานข้อมูลสร้างให้อัตโนมัติ |
| `created_at` | timestamptz | ฐานข้อมูลตั้งให้อัตโนมัติ (ผู้ใช้ปลอมเวลาไม่ได้) |
| `name` | text | 1–20 ตัวอักษร |
| `wish` | text | 1–140 ตัวอักษร |
| `krathong_type` | text | `banana_leaf` / `ice` / `bread` / `invisible` |
| `decorations` | text[] | เฉพาะ `flowers` / `coin10` / `nail` ไม่ซ้ำ (ว่างได้) ธูปเทียนมีทุกใบ จึงไม่เก็บ |
| `lane`, `landing_x` | smallint, real | แถวและจุดตกลงน้ำ ให้ทุกเครื่องเห็นกระทงตำแหน่งเดียวกัน |
| `coin_collected_at` | timestamptz | เวลาที่เด็กเก็บเหรียญไป (server ตั้งเท่านั้น, ว่าง = ยังมีเหรียญ) ดูข้อ 8 |

ความยาวชื่อ/คำอธิษฐานตรงกับช่องกรอกในเว็บ (`NAME_MAX`, `WISH_MAX` ใน `src/types.ts`) ถ้าแก้ฝั่งหนึ่งต้องแก้อีกฝั่งด้วย

---

## 1) หา Project URL และ anon key

1. เข้า [Supabase Dashboard](https://supabase.com/dashboard) แล้วเลือกโปรเจกต์
2. กดปุ่ม **Connect** ด้านบน หรือไปที่ **Project Settings > API Keys** (โปรเจกต์รุ่นเก่าอยู่ที่ **Project Settings > API**)
3. คัดลอก 2 ค่า:
   - **Project URL** หน้าตาแบบ `https://xxxxxxxx.supabase.co` (อยู่ใน Connect หรือ **Project Settings > Data API**)
   - **anon public key** (แท็บ Legacy API keys) **หรือ** **Publishable key** ที่ขึ้นต้นด้วย `sb_publishable_` ใช้ตัวไหนก็ได้

> ❌ **ห้ามใช้** `service_role` key หรือ Secret key (`sb_secret_...`) ในเว็บเด็ดขาด
> key พวกนี้ข้าม RLS ทั้งหมด ถ้าหลุด ใครก็ลบข้อมูลทั้งตารางได้
>
> ✅ anon/publishable key **เปิดเผยได้** เพราะยังไงก็เห็นได้ใน browser
> ความปลอดภัยมาจาก RLS ในข้อ 2 ไม่ใช่การซ่อน key

## 2) สร้างตาราง (รัน schema.sql)

1. Dashboard > **SQL Editor** > **New query**
2. เปิดไฟล์ `supabase/schema.sql` คัดลอกทั้งไฟล์ไปวาง
3. กด **Run** ต้องขึ้น `Success. No rows returned`

ไฟล์นี้รันซ้ำได้ ไม่ลบข้อมูลเดิม ถ้าแก้ schema ทีหลังก็รันซ้ำได้เลย

## 3) สร้าง .env.local

ที่โฟลเดอร์โปรเจกต์:

```bash
cp .env.example .env.local
```

(Windows PowerShell: `Copy-Item .env.example .env.local`)

เปิด `.env.local` แล้วใส่ค่าจากข้อ 1 (ไม่ต้องมีเครื่องหมายคำพูด):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ค่า anon หรือ publishable key
```

จากนั้น **รีสตาร์ท dev server** (`Ctrl+C` แล้ว `npm run dev`) เพราะ Vite อ่าน `.env.local` ตอนเริ่มเท่านั้น

เช็คว่าไฟล์ไม่ถูก git track:

```bash
git status          # ต้องไม่เห็น .env.local
git check-ignore -v .env.local   # ต้องขึ้น .gitignore:...:.env.local
```

## 4) เช็คว่า RLS เปิดอยู่

- **Table Editor** > ตาราง `krathongs`: มุมขวาบนต้องไม่มีป้ายสีแดง/ส้ม "RLS disabled" หรือ "Unrestricted"
- **Authentication > Policies** (บางเวอร์ชันอยู่ที่ **Database > Policies**): ตาราง `krathongs` ต้องมี 2 policy
  - `krathongs: anyone can read` (SELECT)
  - `krathongs: anyone can create` (INSERT)
  - **ต้องไม่มี** policy UPDATE หรือ DELETE
- หรือเช็คด้วย SQL:

```sql
select relrowsecurity as rls_enabled from pg_class where oid = 'public.krathongs'::regclass;
-- ต้องได้ true
```

## 5) ทดสอบ

### 5.1 ทดสอบอัตโนมัติ (schema + RLS)

```bash
npm run test:supabase
```

script จะทดสอบด้วย anon key (สิทธิ์เดียวกับคนเข้าเว็บ):

- สร้างกระทงทุกแบบ รวมกรณีไม่มีของตกแต่ง
- ส่งข้อมูลผิดต้องถูกปฏิเสธ เช่น ชื่อว่าง, คำอธิษฐานยาวเกิน, แบบกระทงที่ไม่มีในลิสต์
- UPDATE/DELETE ต้องถูกบล็อก ทั้งผ่าน client และผ่าน REST ตรง
- key ผิดต้องได้ error

ผลที่ถูกต้อง: ต้องขึ้น `✅ ผ่านทั้งหมด`

### 5.2 ทดสอบจากหน้าเว็บ

1. `npm run dev` แล้วเปิดเว็บ กด **สร้างกระทง** เลือกแบบ/ของตกแต่ง ใส่ชื่อและคำอธิษฐาน กด **ลอยกระทงกันเลย**
2. กระทงต้องตกลงแม่น้ำ และตัวนับ "ทั้งหมด X ใบ" เพิ่มขึ้น 1
3. Dashboard > **Table Editor** > `krathongs` ต้องเห็นแถวใหม่ ข้อมูลตรงกับที่กรอก

### 5.3 ลบแถวทดสอบ

แถวที่ทดสอบจะอยู่ในฐานข้อมูลจริงและทุกคนเห็น ผู้ใช้ทั่วไปลบไม่ได้ ให้ลบใน SQL Editor ซึ่งใช้สิทธิ์ admin:

```sql
delete from public.krathongs where name like 'ทดสอบ%';
```

## 6) Deploy (Vercel / Netlify ฯลฯ)

- ตั้ง `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ที่หน้าตั้งค่า Environment Variables ของ hosting
  - **Vercel:** Project > Settings > Environment Variables
  - **Netlify:** Site configuration > Environment variables
- **ห้าม** commit `.env.local` หรือใส่ key ลงใน repo
- Vite ฝังค่าเหล่านี้ตอน **build** ถ้าเปลี่ยนค่าที่ hosting ต้อง **deploy ใหม่** ถึงจะมีผล
- ถ้าลืมตั้งค่า เว็บยังเปิดได้ แต่จะขึ้นข้อความ "ระบบยังไม่พร้อมใช้งาน" และบันทึกกระทงไม่ได้
  รายละเอียดดูได้ใน Console ของ browser

## 7) ถ้า key หลุดไป GitHub

การลบไฟล์ออกใน commit ใหม่ **ไม่พอ** เพราะ key ยังอยู่ใน git history ต้อง rotate ทันที

- **service_role / Secret key หลุด (อันตรายมาก):** ทำทันที
  - **Secret key** (`sb_secret_...`): **Project Settings > API Keys** สร้าง key ใหม่ แล้วลบ key เก่า
  - **service_role แบบ legacy:** **Project Settings > JWT Keys** เปลี่ยน JWT secret หรือย้ายไปใช้ระบบ key ใหม่แล้วปิด legacy key
    การเปลี่ยน JWT secret ทำให้ anon key เก่าใช้ไม่ได้ด้วย ต้องอัปเดตค่าในเว็บ
  - จากนั้นตรวจข้อมูลในตารางว่าถูกแก้หรือลบหรือไม่
- **anon / Publishable key หลุด:** ไม่ร้ายแรง เพราะเป็น key สาธารณะอยู่แล้ว (ป้องกันด้วย RLS)
  แต่ถ้าต้องการเปลี่ยนก็ rotate ได้แบบเดียวกัน
- อัปเดตค่าใหม่ใน `.env.local` และที่ hosting แล้ว deploy ใหม่

ป้องกันไว้ก่อน: เปิด **Secret scanning / Push protection** ใน GitHub (Settings > Code security)

---

## 8) เด็กเก็บเหรียญ (pg_cron + Realtime)

เด็กจะโผล่จากน้ำมาเก็บเหรียญ 10 จากกระทงที่มีเหรียญ **server เป็นคนตัดสิน** ผ่าน pg_cron แล้วทุกเครื่องที่เปิดเว็บอยู่เห็นพร้อมกันผ่าน Realtime

กติกา (ค่าอยู่ในตาราง `public.coin_collector_config` แถวเดียว แก้ที่เดียว)

| ค่า | ปัจจุบัน | ความหมาย |
| --- | --- | --- |
| `min_age` | 20 วินาที | กระทงต้องสร้างมาแล้วอย่างน้อยเท่านี้ (เวลา server) |
| `cooldown` | 20 วินาที | ระยะห่างขั้นต่ำระหว่างรอบ (ต้องยาวกว่าแอนิเมชันเด็ก 5 วินาที) |
| `chance` | 1 | โอกาสที่เด็กจะโผล่ในรอบที่มีกระทงมีสิทธิ์ (1 = ครบเวลาแล้วเก็บเลย ไม่สุ่ม) |

- pg_cron เรียก `collect_one_coin()` **ทุก 10 วินาที** ฟังก์ชันบังคับ cooldown เอง จึงเก็บได้ราวทุก 20 วินาที
  (ยอมให้คลาด 2 วินาที เพราะ cron แต่ละรอบเริ่มช้า/เร็วได้เสี้ยววินาที ถ้าเทียบ 20 วินาทีเป๊ะ บางรอบจะถูกข้ามไปเป็น 30 วินาที
  รอบ cron ห่างกัน 10 วินาที จึงไม่มีการเก็บก่อน 20 วินาทีจริง)
- "รอบ" = ครั้งที่มีกระทงมีสิทธิ์และพ้น cooldown: สุ่มเลือกกระทงมีสิทธิ์ 1 ใบ แล้วเก็บเลย (ไม่สุ่มว่าจะโดนไหม)
  ไม่มีกระทงมีสิทธิ์ = ไม่นับเป็นรอบ / ถ้าตั้ง `chance` ต่ำกว่า 1 จะกลับมาสุ่มโอกาส (สุ่มไม่ผ่าน = รอรอบถัดไป)
- เก็บแล้วตั้ง `coin_collected_at` (ไม่ลบเหรียญออกจาก `decorations` เก็บไว้ทำสถิติ) ใบที่ถูกเก็บแล้วไม่ถูกเก็บซ้ำ
- ผู้ใช้เว็บสั่งเก็บเองไม่ได้: ถอนสิทธิ์ execute ของฟังก์ชันจาก anon/authenticated และยังไม่มีสิทธิ์ UPDATE ตาราง
  ตาราง config/สถานะ ผู้ใช้เว็บอ่าน/แก้ไม่ได้

ฝั่งเว็บ: เด็กโผล่ **กลางจอ** โดยรอให้กระทงเป้าหมายลอยมาถึงกลางจอเอง (เหรียญยังอยู่บนกระทงระหว่างรอ)
แอนิเมชันยาว 5 วินาที ก้มสุดที่ 2.3 วินาที = เหรียญหาย + แจ้งเตือน "เด็กเก็บเหรียญจากกระทงของ …" (ค้าง 15 วินาที)

### 8.1 ติดตั้ง

1. **เปิด pg_cron:** Dashboard > **Integrations > Cron** > Enable (หรือ **Database > Extensions** ค้นหา `pg_cron` แล้วเปิด)
2. **รัน migration ตามลำดับ** ใน SQL Editor (New query > วางทั้งไฟล์ > Run รันซ้ำได้):
   1. `supabase/migrations/20261124_coin_collector.sql` (คอลัมน์ `coin_collected_at`, ฟังก์ชัน, Realtime)
   2. `supabase/migrations/20261126_coin_collector_v2.sql` (ค่าตั้งใหม่ 20 วินาที / เก็บทุกครั้ง, cron ทุก 10 วินาที)
   - v2 เช็คเวอร์ชัน pg_cron ก่อน: ต้อง 1.5 ขึ้นไปถึงจะตั้งรอบเป็นวินาทีได้ ถ้าต่ำกว่าจะหยุดพร้อมข้อความ (ไม่แก้อะไร)
     เช็คเอง: `select extversion from pg_extension where extname = 'pg_cron';`
3. **เช็ค Realtime:** Dashboard > **Database > Publications** > `supabase_realtime` ต้องมีตาราง `krathongs`
4. **เช็ค cron:** Integrations > Cron ต้องเห็นงาน `collect-one-coin` รอบ `10 seconds`
   หรือ SQL: `select jobname, schedule, active from cron.job;`

### 8.2 ทดสอบ

- **ทดสอบกติกาแบบจำลองเวลา (ไม่ต้องรอจริง):** รัน `supabase/tests/coin_collector_test.sql` ใน SQL Editor
  ผลจะขึ้นเป็น `ERROR: TEST REPORT ...` โดยตั้งใจ (เพื่อย้อนข้อมูลทดสอบทั้งหมด) ทุกบรรทัดต้องเป็น `PASS` และจบด้วย `ALL PASSED`
- **ทดสอบสิทธิ์:** `npm run test:supabase` (หัวข้อ 4b: anon เรียกฟังก์ชัน/แก้ coin_collected_at/อ่าน config ไม่ได้)
- **ดูของจริง:** สร้างกระทงที่มีเหรียญ รอ 20 วินาทีขึ้นไป แล้วดูในเว็บ (เด็กจะรอให้กระทงลอยมาถึงกลางจอก่อน)
  ดูประวัติการเก็บ: `select name, created_at, coin_collected_at from public.krathongs where coin_collected_at is not null order by coin_collected_at desc;`

### 8.3 ปรับค่า / ปิดชั่วคราว

- เปลี่ยนโอกาส/อายุขั้นต่ำ/cooldown (มีผลทันที ไม่ต้องรัน migration ใหม่):
  `update public.coin_collector_config set chance = 0.8, min_age = interval '30 seconds', cooldown = interval '30 seconds';`
  (cooldown ต่ำสุด 5 วินาที = ความยาวแอนิเมชัน / ถ้าปรับ cooldown ให้เป็นเลขที่หารด้วยรอบ cron 10 วินาทีลงตัว)
- หยุดชั่วคราว: `select cron.unschedule('collect-one-coin');` (เปิดใหม่: รัน migration v2 อีกครั้ง)
- คืนเหรียญทั้งหมด (เช่น หลังทดสอบ): `update public.krathongs set coin_collected_at = null;`

---

## 9) เจ้าแม่คงคาประกาศผู้โชคดี (Lucky Draw)

เจ้าแม่คงคาผุดขึ้นกลางแม่น้ำ เลือกกระทง 1 ใบ แล้วประกาศชื่อผู้โชคดี ค้างบนจอ ~5 นาทีแล้วจางหาย
**จับครั้งเดียวตลอดไป ผู้โชคดี 1 คน** ตัดสินที่ server (pg_cron) ทุกเครื่องเห็นช่วงเวลาเดียวกัน (คิดจากเวลา server)
รางวัลแจกที่งานออฟไลน์ (เว็บไม่ติดต่อผู้ชนะ)

> ⚠️ **ห้ามเปิด `enabled` บน database จริงระหว่างทดสอบแล้วทิ้งไว้** ไม่งั้นสิทธิ์จับครั้งเดียวจะถูกใช้ไป
> ถ้าเปิดเพื่อทดสอบ ต้องรีเซ็ตตามข้อ 9.4 ทุกครั้ง
>
> ข้อจำกัดที่รับทราบ: ยังไม่มีการกรองคำไม่เหมาะสมในชื่อผู้ใช้ (ชื่อผู้ชนะแสดงตามที่พิมพ์)

กติกา

- เมื่อมี **กระทงใบแรกที่สร้างหลังเปิดกิจกรรม** และผ่านไป `delay_seconds` (120 วินาที) → จับ 1 ครั้ง
  สุ่ม 1 ใบจากกระทงทั้งหมดที่สร้างหลังเปิดกิจกรรม ณ ตอนจับ (กระทงล่องหนก็มีสิทธิ์)
- จับแล้วไม่จับอีก: database บังคับให้ `lucky_draws` มีได้แค่ 1 แถว (ใส่แถวที่สองจะถูกปฏิเสธ)
- ค่าตั้งอยู่ในตาราง `public.lucky_draw_config` (แถวเดียว id = 1)

| ค่า | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `enabled` | false | เปิดกิจกรรมหรือยัง |
| `enabled_at` | - | เวลาเปิดกิจกรรม (นับเฉพาะกระทงที่สร้างหลังเวลานี้) |
| `delay_seconds` | 120 | จับหลังกระทงใบแรกของกิจกรรมกี่วินาที |
| `hold_seconds` | 300 | เจ้าแม่ค้างบนจอกี่วินาที (ไม่รวมช่วงผุด 7 วินาทีและจางหาย 4 วินาที) |

- ผู้ใช้เว็บอ่านได้อย่างเดียวผ่าน `get_lucky_draw_state()` (ไม่มีคำอธิษฐานของผู้ชนะ) — สั่งจับ/แก้ผล/อ่านค่าตั้งไม่ได้

### 9.1 ติดตั้ง

1. ต้องเปิด pg_cron แล้ว (ข้อ 8.1)
2. SQL Editor > รัน `supabase/migrations/20261127_lucky_draw.sql` (รันซ้ำได้ ไม่เปิดกิจกรรมเอง)
3. เช็ค: Integrations > Cron ต้องเห็นงาน `run-lucky-draw` รอบ `10 seconds`
   และ Database > Publications > `supabase_realtime` ต้องมีตาราง `lucky_draws`

### 9.2 ทดสอบ (ไม่ใช้สิทธิ์จับจริง)

- รัน `supabase/tests/lucky_draw_test.sql` ใน SQL Editor → ขึ้น `ERROR: TEST REPORT ...` โดยตั้งใจ ทุกบรรทัดต้อง `PASS` และจบด้วย `ALL PASSED`
  (จำลองเวลาและย้อนกลับทั้งหมด ไม่เปิดกิจกรรมจริง)
- `npm run test:supabase` หัวข้อ 4c: anon อ่านสถานะได้ แต่สั่งจับ/เขียนผล/อ่านค่าตั้งไม่ได้

### 9.3 เปิดกิจกรรมจริง (วันงาน)

```sql
delete from public.lucky_draws;
update public.lucky_draw_config set enabled = true, enabled_at = now() where id = 1;
```

นับจากนี้ กระทงใบแรกที่มีคนสร้าง + 2 นาที = เจ้าแม่ผุดประกาศผู้โชคดีบนทุกจอ
ดูผล: `select k.name, d.drawn_at from public.lucky_draws d join public.krathongs k on k.id = d.krathong_id;`

ปรับเวลา (ทำก่อนเปิดกิจกรรม): `update public.lucky_draw_config set delay_seconds = 300, hold_seconds = 600 where id = 1;`

### 9.4 รีเซ็ตหลังทดสอบ

```sql
delete from public.lucky_draws;                                              -- ลบผลก่อน (กระทงผู้ชนะลบไม่ได้ถ้ายังมีผลอยู่)
update public.lucky_draw_config set enabled = false, enabled_at = null where id = 1;
delete from public.krathongs where name like 'ทดสอบ%';                        -- ลบกระทงทดสอบ
```

---

## เรื่องที่ควรรู้

- ทุกคนเห็นชื่อและคำอธิษฐานของทุกกระทง ในแม่น้ำและในหน้า "ดูคำอธิษฐานทั้งหมด"
  หน้ากรอกจึงแนะนำให้ใช้ชื่อเล่นหรือนามแฝง
- ถ้ายังไม่มีกระทงในฐานข้อมูล แม่น้ำจะว่าง และตัวนับเป็น 0 (ไม่มีกระทงตัวอย่าง)
- เว็บดึงกระทงใหม่ทุก 60 วินาทีขณะเปิดดูอยู่ และทุกครั้งที่กลับมาที่แท็บ
- ยังไม่มีระบบกันสแปมแบบจำกัดจำนวนครั้ง มีแค่ CHECK ความยาวและค่าที่ยอมรับ
  ถ้าเปิดใช้จริงแล้วโดนสแปม ให้พิจารณาเพิ่ม Supabase Edge Function + CAPTCHA (เช่น Cloudflare Turnstile)
