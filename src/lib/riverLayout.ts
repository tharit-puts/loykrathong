import { LAYERS } from '../components/RiverWaves';
import type { Krathong, Lane } from '../types';

/**
 * สูตรตำแหน่งกระทงบนแม่น้ำ ใช้ร่วมกันระหว่าง River (วาด) และ useKrathongs (เลือกจุดตกตอนสร้าง)
 *
 * กระทงแต่ละใบลอยวนบนเส้นทางของแถวตัวเอง ด้วยความเร็วคลื่นของแถวนั้น
 * ตำแหน่ง ณ เวลา T = (จุดตก + ความเร็ว × เวลาที่ผ่านไปตั้งแต่สร้าง) mod ความยาวเส้นทาง
 * → กระทงในแถวเดียวกันลอยเร็วเท่ากัน ระยะห่างระหว่างกันจึงคงที่ตลอด
 */

/** จำนวนกระทงสูงสุดที่ลอยอยู่บนแม่น้ำพร้อมกัน (ใบใหม่สุด) */
export const MAX_VISIBLE = 12;
/** แนวน้ำของแต่ละแถว (สัดส่วนความสูงแม่น้ำ) ให้อยู่ในแถบที่มองเห็นของคลื่นชั้นนั้น (ชั้นเริ่มที่ 0%, 20%, 42%) */
export const LANE_WATERLINE = [0.13, 0.33, 0.68];
/** แถวไกลกระทงเล็กลง ให้เห็นความลึก */
const LANE_SCALE = [0.75, 0.88, 1];
/** เส้นทางลอย: เริ่มนอกจอซ้ายพ้นทั้งใบ จบนอกจอขวา 40px แล้ววนใหม่ */
const PATH_END_PAD = 40;
/** ขนาดกระทงในแม่น้ำ (คูณจากขนาดพื้นฐาน) */
const KRATHONG_SCALE = 1.5;
/** มือถือ (จอกว้างไม่ถึง 768px = breakpoint md): กระทงในแม่น้ำใหญ่ขึ้นอีก 20% */
const MOBILE_MAX_W = 768;
const MOBILE_SCALE = 1.2;

/**
 * ระยะห่างขั้นต่ำระหว่างจุดกึ่งกลางกระทงในแถวเดียวกัน (เท่าของความกว้างกระทง 1 ใบ)
 * 0.7 = ชิดกันได้แต่ยังเห็นขอบแต่ละใบ — ลดค่าให้ชิดขึ้น / เพิ่มให้ห่างขึ้น
 */
export const MIN_GAP = 0.7;
/** ช่วงจุดตกปกติ: รอบกลางจอ ±10% */
const DROP_RANGE: [number, number] = [0.4, 0.6];
/** ถ้ากลางจอเต็ม ขยายไปทั้งจอ (เว้นขอบ 10%) */
const WIDE_RANGE: [number, number] = [0.1, 0.9];
/** ความละเอียดของจุดที่ลองวาง (สัดส่วนความกว้างจอ) */
const X_STEP = 0.005;

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** กระทงที่ไม่มี lane หรือ x (เช่น สร้างผ่าน API โดยไม่ส่งค่า) ให้ค่าคงที่จาก id */
export const laneOf = (k: Krathong): Lane => k.lane ?? ((hash(k.id) % 3) as Lane);
export const xOf = (k: Krathong) => k.x ?? (hash(`${k.id}:x`) % 1000) / 1000;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** ขนาดกระทงและเส้นทางลอยของแถวนั้น บนแม่น้ำกว้าง riverW px */
export function lanePath(riverW: number, lane: Lane) {
  const deviceScale = riverW < MOBILE_MAX_W ? MOBILE_SCALE : 1;
  const width = Math.min(120, Math.max(84, riverW * 0.1)) * KRATHONG_SCALE * deviceScale * LANE_SCALE[lane];
  const start = -Math.ceil(width + 20);
  const end = riverW + PATH_END_PAD;
  return { width, start, end, travel: end - start, speed: LAYERS[lane].speed };
}

/** ระยะบนเส้นทาง (px นับจากจุดเริ่ม) ของกระทงที่ตกที่ x ตอน createdAt เมื่อถึงเวลา atMs */
export function pathPos(x: number, createdAt: number, lane: Lane, riverW: number, atMs: number) {
  const { width, start, travel, speed } = lanePath(riverW, lane);
  const landing = x * riverW - width / 2 - start;
  return mod(landing + speed * Math.max(0, (atMs - createdAt) / 1000), travel);
}

/**
 * เลือกแถวและจุดตกของกระทงใบใหม่ ให้ห่างจากกระทงในแถวเดียวกันอย่างน้อย MIN_GAP
 * 1) ลองทุกแถว × ทุกจุดรอบกลางจอ (±10%) แล้วสุ่มจากจุดที่ห่างพอ
 * 2) ถ้ากลางจอไม่มีที่ว่าง ขยายไปทั้งจอ
 * 3) ถ้าเต็มจริงๆ ยอมซ้อน แต่เลือกจุดที่ซ้อนน้อยที่สุด
 * (กระทงต่างแถวลอยเร็วไม่เท่ากัน ยังไงก็ต้องสวนกันบ้าง จึงเช็คเฉพาะแถวเดียวกัน)
 */
export function pickLanding(existing: Krathong[], now: number, riverW: number, rand = Math.random) {
  const others = existing.map((k) => ({ lane: laneOf(k), x: xOf(k), createdAt: k.createdAt }));

  const candidates = (range: [number, number]) => {
    const out: { lane: Lane; x: number; clearance: number }[] = [];
    for (const lane of [0, 1, 2] as Lane[]) {
      const { width, travel } = lanePath(riverW, lane);
      const sameLane = others.filter((o) => o.lane === lane).map((o) => pathPos(o.x, o.createdAt, lane, riverW, now));
      for (let x = range[0]; x <= range[1] + 1e-9; x += X_STEP) {
        const p = pathPos(x, now, lane, riverW, now);
        // ระยะแบบวนรอบ: ใบที่หลุดขอบขวาจะวนกลับมาเริ่มทางซ้าย
        const gap = Math.min(Infinity, ...sameLane.map((q) => Math.min(Math.abs(p - q), travel - Math.abs(p - q))));
        out.push({ lane, x, clearance: gap / width });
      }
    }
    return out;
  };

  for (const range of [DROP_RANGE, WIDE_RANGE]) {
    const ok = candidates(range).filter((c) => c.clearance >= MIN_GAP);
    if (ok.length) {
      const c = ok[Math.floor(rand() * ok.length)];
      return { lane: c.lane, x: c.x };
    }
  }
  const best = candidates(WIDE_RANGE).reduce((a, b) => (b.clearance > a.clearance ? b : a));
  return { lane: best.lane, x: best.x };
}
