import { useEffect, useRef } from 'react';
import kidArt from '../assets/kid/kid.webp';
import coinArt from '../assets/kid/coin-single.webp';

/**
 * เด็กโผล่จากน้ำมาหยิบเหรียญ 10 จากกระทง (เล่นครั้งเดียว 5 วินาที แล้วเรียก onFinish)
 *
 * วางในกล่องเดียวกับกระทง (กว้าง krathongW, มุมซ้ายบน = มุมซ้ายบนของรูปกระทง) ลอยไปพร้อมกระทง
 * ตำแหน่งเด็กคำนวณย้อนจากจุดเหรียญบนกระทง: ตอนก้มสุด ปลายนิ้วที่หยิบต้องอยู่ตรงเหรียญพอดี ทุกขนาดจอ
 * แนวน้ำ: ตัดภาพส่วนที่อยู่ใต้แนวน้ำของกระทงทิ้ง (clip-path) เด็กจึงดูจมน้ำอยู่ครึ่งตัวในทุกแถว
 *
 * แอนิเมชันใช้ Web Animations API: เวลาแต่ละช่วงอยู่ใน KID_PHASES ที่เดียว (จังหวะ onBend คิดจากค่าชุดเดียวกัน)
 * เล่นเสมอแม้เครื่องเปิดลดการเคลื่อนไหว (prefers-reduced-motion) ตามที่ตกลงไว้
 */

/** ความยาวแต่ละช่วง (ms) — แก้ตรงนี้ที่เดียว รวมกันคือความยาวทั้งหมด */
export const KID_PHASES = {
  /** 1. โผล่ขึ้นจากน้ำ (ease-out) */
  rise: 1000,
  /** 2. ค้าง มองหาเป้าหมาย */
  look: 500,
  /** 3. ก้มไปหากระทง → จบช่วงนี้ = ก้มสุด (onBend: เหรียญบนกระทงหาย) */
  bend: 800,
  /** 4. ยืดตัวกลับ เหรียญในมือ pop */
  straighten: 700,
  /** 5. ค้างโชว์เหรียญในมือ */
  hold: 1000,
  /** 6. ดำน้ำหาย (ease-in) แล้ว unmount */
  dive: 1000,
} as const;

/** ความยาวทั้งหมด (5 วินาที) */
export const KID_DURATION_MS = Object.values(KID_PHASES).reduce((a, b) => a + b, 0);
/** จังหวะก้มสุด (ms จากเริ่ม) */
export const KID_BEND_AT_MS = KID_PHASES.rise + KID_PHASES.look + KID_PHASES.bend;

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

/** จุดกึ่งกลางแนวนอนของตัวเด็ก (px จากขอบซ้ายรูปกระทง) ใช้คำนวณว่ากระทงต้องอยู่ตรงไหนเด็กถึงจะอยู่กลางจอ */
export function kidCenterX(krathongW: number) {
  const g = geometry(krathongW);
  return g.left + g.kidW / 2;
}

const ease = {
  out: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
  inOut: 'ease-in-out',
  in: 'cubic-bezier(0.55, 0, 0.9, 0.45)',
};

export default function CoinKid({ krathongW, onBend, onFinish }: Props) {
  const onBendRef = useRef(onBend);
  onBendRef.current = onBend;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const g = geometry(krathongW);
  const bodyRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLImageElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const P = KID_PHASES;
    const T = KID_DURATION_MS;
    // จุดเปลี่ยนช่วง (สัดส่วน 0–1 ของเวลาทั้งหมด)
    const up = P.rise / T;
    const lookEnd = (P.rise + P.look) / T;
    const bendAt = KID_BEND_AT_MS / T;
    const straight = (KID_BEND_AT_MS + P.straighten) / T;
    const holdEnd = (KID_BEND_AT_MS + P.straighten + P.hold) / T;

    const down = `translate(0px, ${g.hide.toFixed(1)}px) rotate(0deg)`;
    const stand = 'translate(0px, 0px) rotate(0deg)';
    const lean = `translate(${g.tx.toFixed(1)}px, ${g.ty.toFixed(1)}px) rotate(${BEND_DEG}deg)`;
    const opts: KeyframeAnimationOptions = { duration: T, fill: 'both' };
    const coin = (scale: number) => `translate(-50%, -50%) scale(${scale})`;

    const anims = [
      bodyRef.current?.animate(
        [
          { offset: 0, transform: down, easing: ease.out },
          { offset: up, transform: stand },
          { offset: lookEnd, transform: stand, easing: ease.inOut },
          { offset: bendAt, transform: lean, easing: ease.inOut },
          { offset: straight, transform: stand },
          { offset: holdEnd, transform: stand, easing: ease.in },
          { offset: 1, transform: down },
        ],
        opts,
      ),
      // เหรียญในมือ: โผล่หลังก้มสุด ขยายเกินแล้วเด้งกลับ (bounce เล็กน้อย) ภายในช่วงยืดตัว
      coinRef.current?.animate(
        [
          { offset: 0, transform: coin(0) },
          { offset: bendAt, transform: coin(0), easing: 'ease-out' },
          { offset: bendAt + (straight - bendAt) * 0.5, transform: coin(1.3), easing: 'ease-in-out' },
          { offset: bendAt + (straight - bendAt) * 0.8, transform: coin(0.9), easing: 'ease-out' },
          { offset: straight, transform: coin(1) },
          { offset: 1, transform: coin(1) },
        ],
        opts,
      ),
      // วงน้ำรอบตัว: แผ่ออกตอนโผล่ จางหายตอนดำน้ำ
      rippleRef.current?.animate(
        [
          { offset: 0, opacity: 0, transform: 'translateY(-50%) scaleX(0.4)' },
          { offset: up * 0.9, opacity: 1, transform: 'translateY(-50%) scaleX(1)' },
          { offset: holdEnd, opacity: 1, transform: 'translateY(-50%) scaleX(1)' },
          { offset: 1, opacity: 0, transform: 'translateY(-50%) scaleX(1.3)' },
        ],
        opts,
      ),
    ];

    const bend = window.setTimeout(() => onBendRef.current(), KID_BEND_AT_MS);
    const done = window.setTimeout(() => onFinishRef.current(), T);
    return () => {
      window.clearTimeout(bend);
      window.clearTimeout(done);
      for (const a of anims) a?.cancel();
    };
  }, [g.hide, g.tx, g.ty]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* ตัดเฉพาะด้านล่าง (ใต้แนวน้ำ) ด้านบน/ซ้าย/ขวาปล่อยให้ยื่นได้ตอนก้ม */}
      <div
        className="absolute [clip-path:inset(-200%_-200%_0_-200%)]"
        style={{ left: g.left, top: g.top, width: g.kidW, height: g.waterY - g.top }}
      >
        <div
          ref={bodyRef}
          className="absolute top-0 left-0 origin-[40%_85%]"
          style={{ width: g.kidW, height: g.kidH, transform: `translate(0px, ${g.hide}px)` }}
        >
          {/* เหรียญอยู่หลังภาพเด็ก: ปลายนิ้วบังขอบบนเหรียญ ดูเหมือนถูกหยิบอยู่ */}
          <img
            src={coinArt}
            alt=""
            draggable={false}
            ref={coinRef}
            className="absolute aspect-square max-w-none scale-0 select-none"
            style={{ left: `${PINCH.x * 100}%`, top: `${PINCH.y * 100}%`, width: g.kidW * COIN_W }}
          />
          <img src={kidArt} alt="" draggable={false} className="relative block size-full max-w-none select-none" />
        </div>
      </div>

      {/* วงน้ำกระเพื่อมรอบตัวเด็กที่แนวน้ำ */}
      <span
        ref={rippleRef}
        className="absolute h-[10px] rounded-[50%] border-2 border-white/70 bg-white/25 opacity-0 blur-[0.5px]"
        style={{ left: g.left + g.kidW * 0.08, top: g.waterY, width: g.kidW * 0.72 }}
      />
    </div>
  );
}
