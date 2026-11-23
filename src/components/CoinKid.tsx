import { useEffect, useRef, type CSSProperties } from 'react';
import kidArt from '../assets/kid/kid.webp';
import coinArt from '../assets/kid/coin-single.webp';

/**
 * เด็กโผล่จากน้ำมาหยิบเหรียญ 10 จากกระทง (เล่นครั้งเดียว ~2.8 วินาที แล้วเรียก onFinish)
 *
 * วางในกล่องเดียวกับกระทง (กว้าง krathongW, มุมซ้ายบน = มุมซ้ายบนของรูปกระทง) ลอยไปพร้อมกระทง
 * ตำแหน่งเด็กคำนวณย้อนจากจุดเหรียญบนกระทง: ตอนก้มสุด ปลายนิ้วที่หยิบต้องอยู่ตรงเหรียญพอดี ทุกขนาดจอ
 *
 * ลำดับ (ดู keyframes kid-body / kid-coin / kid-ripple ใน styles/index.css):
 *   0–0.6s โผล่ขึ้นจากน้ำ → 0.8–1.2s ก้มไปหากระทง (ก้มสุด = onBend ซ่อนเหรียญบนกระทง)
 *   → 1.2–1.6s ยืดตัวกลับ เหรียญ pop ในมือ → ค้าง ~0.5s → 2.1–2.7s ดำน้ำหาย → onFinish
 * แนวน้ำ: ตัดภาพส่วนที่อยู่ใต้แนวน้ำของกระทงทิ้ง (clip-path) เด็กจึงดูจมน้ำอยู่ครึ่งตัวในทุกแถว
 */

/** ระยะเวลาทั้งหมด และจังหวะก้มสุด (ต้องตรงกับ % ใน keyframes kid-body) */
export const KID_DURATION_MS = 2800;
const BEND_AT = 0.43;

/* ---------- สัดส่วนในภาพเด็ก (kid.webp 600×800 = ต้นฉบับ 1086×1448) ---------- */
const KID_ASPECT = 600 / 800;
/** จุดกึ่งกลางเหรียญใต้ปลายนิ้วโป้ง/นิ้วชี้ของมือที่หยิบ (ต้นฉบับ x 990, y 855) */
const PINCH = { x: 990 / 1086, y: 855 / 1448 };
/** จุดหมุนตอนก้ม: ช่วงล่างลำตัว (อยู่ใต้น้ำ) */
const PIVOT = { x: 0.4, y: 0.85 };
/** ขนาดเหรียญในมือ (ความกว้างภาพเหรียญ เทียบความกว้างภาพเด็ก) */
const COIN_W = 0.13;

/* ---------- ตำแหน่งบนกระทง (ตรงกับ KrathongIcon: กรอบ 6:5, แนวน้ำ 80%) ---------- */
const ICON_H = 5 / 6;
const ICON_WATERLINE = 0.8;
/** เหรียญบนกระทง: กึ่งกลาง x 71.9%, ขอบล่าง 44.6% จากล่าง, กว้าง 25.4% ภาพ 480×225 */
const COIN_ON_KRATHONG = { x: 0.719, bottom: 0.446, w: 0.254, aspect: 225 / 480 };

/* ---------- ท่าทาง (ปรับได้) ---------- */
/** ขนาดเด็กเทียบความกว้างกระทง */
const KID_SCALE = 1;
/** ท่ายืน: มือที่หยิบลอยอยู่ซ้าย/เหนือเหรียญเท่านี้ (สัดส่วนความกว้างกระทง) แล้วก้มไปหาเหรียญ */
const HOVER = { x: 0.15, y: 0.08 };
/**
 * องศาที่ก้ม (ตามเข็ม = เอนไปข้างหน้า เพราะเด็กหันขวา)
 * ไม่ควรเกิน ~12°: มือที่หยิบอยู่สูงระดับไหล่ ก้มมากแล้วต้องยกตัวขึ้นชดเชย ขอบล่างภาพ (เอว) จะโผล่พ้นน้ำ
 */
const BEND_DEG = 10;

interface Props {
  /** ความกว้างรูปกระทง (px) */
  krathongW: number;
  /** เด็กก้มสุด: ซ่อนเหรียญบนกระทง */
  onBend: () => void;
  /** เล่นจบ (ดำน้ำหายแล้ว): unmount */
  onFinish: () => void;
}

type KidVars = CSSProperties & Record<'--kid-hide' | '--kid-tx' | '--kid-ty' | '--kid-bend', string>;

/**
 * คำนวณตำแหน่งเด็ก (px ในกล่องกระทง)
 * - ท่ายืน: ปลายนิ้วที่หยิบลอยอยู่ซ้าย-บนของเหรียญ (HOVER)
 * - ก้มสุด: หมุน BEND_DEG รอบจุดหมุน + เลื่อน (tx, ty) ให้ปลายนิ้วตรงเหรียญพอดี
 * ทุกค่าเป็นสัดส่วนของความกว้างกระทง จึงตรงกันทุกขนาดจอ/ทุกแถว
 */
function geometry(w: number) {
  const iconH = w * ICON_H;
  const waterY = iconH * ICON_WATERLINE;
  const coinH = w * COIN_ON_KRATHONG.w * COIN_ON_KRATHONG.aspect;
  const coin = { x: w * COIN_ON_KRATHONG.x, y: iconH * (1 - COIN_ON_KRATHONG.bottom) - coinH / 2 };

  const kidW = w * KID_SCALE;
  const kidH = kidW / KID_ASPECT;
  const left = coin.x - HOVER.x * w - PINCH.x * kidW;
  const top = coin.y - HOVER.y * w - PINCH.y * kidH;

  // เวกเตอร์จากจุดหมุนไปปลายนิ้ว หมุนตามองศาที่ก้ม (แกน y ชี้ลง: ตามเข็ม = ค่าบวกใน CSS)
  const vx = (PINCH.x - PIVOT.x) * kidW;
  const vy = (PINCH.y - PIVOT.y) * kidH;
  const t = (BEND_DEG * Math.PI) / 180;
  const rx = vx * Math.cos(t) - vy * Math.sin(t);
  const ry = vx * Math.sin(t) + vy * Math.cos(t);
  // ปลายนิ้วหลังหมุนเลื่อนไป (rx - vx, ry - vy) จึงเลื่อนตัวเพิ่มอีกเท่าที่ขาดให้ถึงเหรียญ
  const tx = HOVER.x * w - (rx - vx);
  const ty = HOVER.y * w - (ry - vy);

  return { kidW, kidH, left, top, waterY, tx, ty, hide: waterY - top + 6 };
}

export default function CoinKid({ krathongW, onBend, onFinish }: Props) {
  const onBendRef = useRef(onBend);
  onBendRef.current = onBend;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const bend = window.setTimeout(() => onBendRef.current(), KID_DURATION_MS * BEND_AT);
    const done = window.setTimeout(() => onFinishRef.current(), KID_DURATION_MS);
    return () => {
      window.clearTimeout(bend);
      window.clearTimeout(done);
    };
  }, []);

  const g = geometry(krathongW);
  const vars: KidVars = {
    '--kid-hide': `${g.hide.toFixed(1)}px`,
    '--kid-tx': `${g.tx.toFixed(1)}px`,
    '--kid-ty': `${g.ty.toFixed(1)}px`,
    '--kid-bend': `${BEND_DEG}deg`,
  };

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* ตัดเฉพาะด้านล่าง (ใต้แนวน้ำ) ด้านบน/ซ้าย/ขวาปล่อยให้ยื่นได้ตอนก้ม */}
      <div
        className="absolute [clip-path:inset(-200%_-200%_0_-200%)]"
        style={{ left: g.left, top: g.top, width: g.kidW, height: g.waterY - g.top }}
      >
        <div
          className="absolute top-0 left-0 origin-[40%_85%] animate-kid-body"
          style={{ ...vars, width: g.kidW, height: g.kidH }}
        >
          {/* เหรียญอยู่หลังภาพเด็ก: ปลายนิ้วบังขอบบนเหรียญ ดูเหมือนถูกหยิบอยู่ */}
          <img
            src={coinArt}
            alt=""
            draggable={false}
            className="absolute aspect-square max-w-none animate-kid-coin select-none"
            style={{ left: `${PINCH.x * 100}%`, top: `${PINCH.y * 100}%`, width: g.kidW * COIN_W }}
          />
          <img src={kidArt} alt="" draggable={false} className="relative block size-full max-w-none select-none" />
        </div>
      </div>

      {/* วงน้ำกระเพื่อมรอบตัวเด็กที่แนวน้ำ */}
      <span
        className="absolute h-[10px] -translate-y-1/2 animate-kid-ripple rounded-[50%] border-2 border-white/70 bg-white/25 blur-[0.5px]"
        style={{ left: g.left + g.kidW * 0.08, top: g.waterY, width: g.kidW * 0.72 }}
      />
    </div>
  );
}
