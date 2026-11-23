import type { CSSProperties } from 'react';

/**
 * คลื่นน้ำ 3 ชั้นแบบ parallax เลื่อนไปทางขวาไม่รู้จบ
 *
 * วิธีทำ: แต่ละชั้นเป็น div ไล่สีแนวตั้ง แล้วใช้ mask ตัดขอบบนเป็นลอนคลื่น
 * div กว้างกว่าจอ 1 ลูกคลื่น (period) วางเลยซ้ายไป 1 ลูก แล้วเลื่อน translateX ไปทางขวา 1 ลูก
 * ลายตอนจบจึงตรงกับตอนเริ่มพอดี วนซ้ำได้ไม่มีรอยต่อ และลูกคลื่นมีขนาดคงที่ทุกความกว้างจอ
 * (จอกว้างก็เห็นจำนวนลูกมากขึ้นเอง)
 */

export interface WaveLayerConfig {
  /** ระยะจากขอบบนของแม่น้ำถึงยอดคลื่นของชั้นนี้ */
  top: string;
  /** ความกว้าง 1 ลูกคลื่น (px) */
  period: number;
  /** ความสูงจากท้องคลื่นถึงยอดคลื่น (px) */
  height: number;
  /** ความเร็ว (px/วินาที): ชั้นหลังช้า ชั้นหน้าเร็ว */
  speed: number;
  gradient: string;
  /** เม็ดละเอียดบนผิวน้ำ */
  grain?: boolean;
}

/** เรียงจากหลังสุด → หน้าสุด */
export const LAYERS: WaveLayerConfig[] = [
  {
    top: '0%',
    period: 200,
    height: 30,
    speed: 10,
    gradient: 'linear-gradient(180deg, #b3e8bb 0%, #6ccbc2 30%, #29b2c6 100%)',
  },
  {
    top: '20%',
    period: 150,
    height: 26,
    speed: 18,
    gradient: 'linear-gradient(180deg, #a5dfbf 0%, #5aaec0 45%, #3f97be 100%)',
  },
  {
    top: '42%',
    period: 170,
    height: 28,
    speed: 28,
    gradient: 'linear-gradient(180deg, #6ac7c9 0%, #4a9cc6 40%, #3488c0 100%)',
    grain: true,
  },
];

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** ลอนคลื่น 1 ลูก (คล้าย sine): ท้องคลื่นที่ขอบซ้าย/ขวา ยอดคลื่นตรงกลาง ใต้เส้นทึบ */
function waveTile(p: number, h: number) {
  const lo = h - 1;
  const hi = 1;
  const d = `M0 ${lo} C${p * 0.18} ${lo} ${p * 0.32} ${hi} ${p / 2} ${hi} S${p * 0.82} ${lo} ${p} ${lo} V${h} H0Z`;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${p}" height="${h}"><path d="${d}"/></svg>`);
}

/** noise สีขาวจางๆ ขนาดเท่า 1 ลูกคลื่น (stitchTiles ทำให้ต่อกันเนียน และวนลูปตรงกับคลื่น) */
function grainTile(p: number) {
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${p}" height="${p}">` +
      `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
      `<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.12 0"/></filter>` +
      `<rect width="100%" height="100%" filter="url(#n)"/></svg>`,
  );
}

/** ตัวที่เคลื่อนที่: ตำแหน่ง/ขนาด + ตัวแปรของ animate-wave (ดู index.css) */
function moverStyle({ top, period: p, speed }: WaveLayerConfig): CSSProperties {
  return {
    top,
    left: -p,
    width: `calc(100% + ${p}px)`,
    ['--period' as string]: `${p}px`,
    ['--dur' as string]: `${(p / speed).toFixed(2)}s`,
  };
}

/** ผิวน้ำ: สีไล่ + mask ลอนคลื่น */
function surfaceStyle({ period: p, height: h, gradient, grain }: WaveLayerConfig): CSSProperties {
  // mask ชั้นแรก = ลอนคลื่นเรียงแนวนอนด้านบน, ชั้นที่สอง = ส่วนทึบด้านล่าง (ทับกัน 1px กันเส้นรอยต่อ)
  const maskImage = `${waveTile(p, h)}, linear-gradient(#000, #000)`;
  const maskPosition = `0 0, 0 ${h - 1}px`;
  const maskSize = `${p}px ${h}px, 100% 100%`;
  const maskRepeat = 'repeat-x, no-repeat';

  return {
    backgroundImage: grain ? `${grainTile(p)}, ${gradient}` : gradient,
    backgroundSize: grain ? `${p}px ${p}px, 100% 100%` : undefined,
    backgroundRepeat: grain ? 'repeat, no-repeat' : undefined,
    maskImage,
    maskPosition,
    maskSize,
    maskRepeat,
    WebkitMaskImage: maskImage,
    WebkitMaskPosition: maskPosition,
    WebkitMaskSize: maskSize,
    WebkitMaskRepeat: maskRepeat,
  };
}

/**
 * คลื่น 1 ชั้น — River.tsx วางทีละชั้นสลับกับกระทงแต่ละแถว
 * กระทงแถวบนจึงหลบอยู่หลังคลื่นชั้นหน้าได้จริง
 */
export function WaveLayer({ layer }: { layer: WaveLayerConfig }) {
  return (
    // เงาจางๆ ตามแนวยอดคลื่นช่วยแยกชั้นให้เห็นความลึก (filter ต้องอยู่นอกตัวที่มี mask ไม่งั้นเงาถูกตัดทิ้ง)
    <div
      aria-hidden="true"
      className="absolute bottom-0 animate-wave drop-shadow-[0_-2px_6px_rgba(8,40,80,0.18)] will-change-transform"
      style={moverStyle(layer)}
    >
      <div className="h-full w-full" style={surfaceStyle(layer)} />
    </div>
  );
}
