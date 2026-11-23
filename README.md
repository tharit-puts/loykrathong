# ลอยกระทงร่วมกัน — Loy Krathong Online

หน้าเว็บลอยกระทงออนไลน์แบบ single page สร้างด้วย **Vite + React 18 + TypeScript**

## เริ่มใช้งาน

```bash
npm install
npm run dev        # เปิดที่ http://localhost:5173
npm run build      # typecheck + build ไปที่ dist/
npm run preview    # ดูผล build
```

## โครงสร้าง

```
src/
├── App.tsx                     # ประกอบทุกส่วน + state ของ modal / toast
├── main.tsx
├── types.ts                    # Krathong, KrathongType, NAME_MAX, WISH_MAX
├── hooks/
│   └── useKrathongs.ts         # เก็บกระทงใน localStorage (จุดที่จะเปลี่ยนไปต่อ API)
├── data/
│   ├── samples.ts              # กระทงตัวอย่าง 3 ใบ
│   ├── stats.ts                # สถิติกระทง กทม. ปี 2566–2568
│   └── articles.ts             # เนื้อหาการ์ดบทความ 4 ใบ
├── styles/
│   └── global.css              # ตัวแปรสี ฟอนต์ ปุ่ม .cta
└── components/
    ├── KrathongDefs.tsx        # SVG symbol ของกระทง 3 แบบ (ใบตอง / ขนมปัง / ดอกบัว)
    ├── KrathongIcon.tsx        # <KrathongIcon type="leaf" />
    ├── Navbar.tsx              # เงื่อนไขกิจกรรม · ดูคำอธิษฐานทั้งหมด · ปุ่มแชร์
    ├── Hero.tsx                # ท้องฟ้า + ป้ายโลโก้ + ตัวนับ + ปุ่มสร้างกระทง
    ├── SkyScene.tsx            # ดาว พระจันทร์ เงาวัด
    ├── BannerLogo.tsx          # ป้ายโลโก้สีทอง "ลอยกระทงร่วมกัน"
    ├── River.tsx               # แม่น้ำ (ขอบคลื่น + ลายเกล็ด) และกระทงที่ลอยอยู่
    ├── StatsSection.tsx        # กราฟแท่งสถิติ + สัดส่วนวัสดุปี 2568
    ├── ArticleCards.tsx        # การ์ดบทความ กด "อ่านต่อ" เพื่อขยาย
    ├── Footer.tsx
    ├── Modal.tsx               # ตัวห่อ <dialog>
    ├── CreateKrathongModal.tsx # ฟอร์มสร้างกระทง
    ├── WishesModal.tsx         # รายการคำอธิษฐานทั้งหมด
    ├── TermsModal.tsx          # เงื่อนไขกิจกรรม
    └── Toast.tsx
```

## ปรับแต่งที่ใช้บ่อย

- **สี / ฟอนต์:** แก้ตัวแปรใน `src/styles/global.css`
- **ข้อความโลโก้:** `<BannerLogo text="..." />` ใน `Hero.tsx`
- **จำนวนกระทงบนแม่น้ำ:** prop `maxVisible` ของ `<River />` (ค่าเริ่มต้น 12)
- **ใส่รูปพื้นหลังจริง:** แทน `<SkyScene />` ใน `Hero.tsx` ด้วยรูป หรือใส่ `background-image` ที่ `.hero`
- **ให้ทุกคนเห็นกระทงของกันและกัน:** เปลี่ยน `useKrathongs.ts` ให้ `GET`/`POST` ไปที่ API หลังบ้าน แทน localStorage

## ที่มาของข้อมูลสถิติ

กรุงเทพมหานคร โดยสำนักสิ่งแวดล้อม แถลงเมื่อ 6 พ.ย. 2568
(ปี 2566–2567 รายงานเฉพาะสัดส่วนวัสดุธรรมชาติ)
