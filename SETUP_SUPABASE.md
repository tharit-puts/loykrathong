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
- ถ้าลืมตั้งค่า เว็บยังเปิดได้ แต่จะขึ้นข้อความ "ระบบยังไม่พร้อมใช้งาน" และแม่น้ำแสดงกระทงตัวอย่างแทน
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

กติกา (ตั้งค่าใน `public.collect_one_coin` ใน `supabase/migrations/20261124_coin_collector.sql`)

- กระทงที่มีสิทธิ์: มีเหรียญ 10, ยังไม่ถูกเก็บ, สร้างมาแล้วอย่างน้อย 2 นาที (เวลา server)
- cron รันทุก 1 นาที แต่บังคับ cooldown 110 วินาทีระหว่างรอบ จึงเก็บราวทุก 2 นาที (cooldown ไม่ตั้ง 120 พอดี กันรอบถูกข้ามเพราะเวลาคลาดเสี้ยววินาที)
- แต่ละรอบสุ่มกระทงมีสิทธิ์ 1 ใบ และสุ่มโอกาส 70% ว่าเด็กจะมาเก็บหรือไม่ (ไม่มีกระทงมีสิทธิ์ = ไม่นับเป็นรอบ)
- เก็บแล้วตั้ง `coin_collected_at` (ไม่ลบเหรียญออกจาก `decorations` เก็บไว้ทำสถิติ) ใบที่ถูกเก็บแล้วไม่ถูกเก็บซ้ำ
- ผู้ใช้เว็บสั่งเก็บเองไม่ได้: ถอนสิทธิ์ execute ของฟังก์ชันจาก anon/authenticated และยังไม่มีสิทธิ์ UPDATE ตาราง

### 8.1 ติดตั้ง

1. **เปิด pg_cron:** Dashboard > **Integrations > Cron** > Enable (หรือ **Database > Extensions** ค้นหา `pg_cron` แล้วเปิด)
   ถ้าข้ามขั้นนี้ migration จะพยายามเปิดให้เอง ถ้าไม่ผ่านค่อยเปิดจาก Dashboard แล้วรันใหม่
2. **รัน migration:** SQL Editor > New query > วางทั้งไฟล์ `supabase/migrations/20261124_coin_collector.sql` > Run
   (ต้องรัน `supabase/schema.sql` มาก่อนแล้ว / รันซ้ำได้)
3. **เช็ค Realtime:** Dashboard > **Database > Publications** > `supabase_realtime` ต้องมีตาราง `krathongs`
   (migration เพิ่มให้แล้ว หรือเปิดที่ Table Editor > `krathongs` > ปุ่ม Realtime)
4. **เช็ค cron:** Integrations > Cron ต้องเห็นงาน `collect-one-coin` ตาราง `* * * * *` และในแท็บประวัติต้องเห็นรันทุกนาที
   หรือ SQL: `select jobname, schedule, active from cron.job;`

### 8.2 ทดสอบ

- **ทดสอบกติกาแบบจำลองเวลา (ไม่ต้องรอจริง):** รัน `supabase/tests/coin_collector_test.sql` ใน SQL Editor
  ผลจะขึ้นเป็น `ERROR: TEST REPORT ...` โดยตั้งใจ (เพื่อย้อนข้อมูลทดสอบทั้งหมด) ทุกบรรทัดต้องเป็น `PASS` และจบด้วย `ALL PASSED`
- **ทดสอบสิทธิ์:** `npm run test:supabase` (หัวข้อ 4b: anon เรียกฟังก์ชัน/แก้ coin_collected_at ไม่ได้)
- **ดูของจริง:** สร้างกระทงที่มีเหรียญ รอ 2–4 นาที (โอกาส 70% บางรอบเด็กจะไม่มา) แล้วดูในเว็บ
  ดูประวัติการเก็บ: `select name, created_at, coin_collected_at from public.krathongs where coin_collected_at is not null order by coin_collected_at desc;`

### 8.3 ปรับค่า / ปิดชั่วคราว

- เปลี่ยนโอกาส/cooldown/อายุขั้นต่ำ: แก้ค่า default ของพารามิเตอร์ใน `collect_one_coin` แล้วรัน migration ใหม่
- หยุดชั่วคราว: `select cron.unschedule('collect-one-coin');` (เปิดใหม่: รัน migration อีกครั้ง)
- คืนเหรียญทั้งหมด (เช่น หลังทดสอบ): `update public.krathongs set coin_collected_at = null;`

---

## เรื่องที่ควรรู้

- ทุกคนเห็นชื่อและคำอธิษฐานของทุกกระทง ในแม่น้ำและในหน้า "ดูคำอธิษฐานทั้งหมด"
  หน้ากรอกจึงแนะนำให้ใช้ชื่อเล่นหรือนามแฝง
- ถ้ายังไม่มีกระทงในฐานข้อมูล แม่น้ำจะแสดงกระทงตัวอย่างแทน และตัวนับจะนับเฉพาะกระทงจริง
- เว็บดึงกระทงใหม่ทุก 60 วินาทีขณะเปิดดูอยู่ และทุกครั้งที่กลับมาที่แท็บ
- ยังไม่มีระบบกันสแปมแบบจำกัดจำนวนครั้ง มีแค่ CHECK ความยาวและค่าที่ยอมรับ
  ถ้าเปิดใช้จริงแล้วโดนสแปม ให้พิจารณาเพิ่ม Supabase Edge Function + CAPTCHA (เช่น Cloudflare Turnstile)
