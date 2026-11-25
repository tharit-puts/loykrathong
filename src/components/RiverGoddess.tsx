import { useEffect, useMemo, useRef, useState } from 'react';
import goddessArt from '../assets/goddess/goddess.webp';
import KrathongIcon from './KrathongIcon';
import { shownDecorations, type Krathong } from '../types';

/**
 * เจ้าแม่คงคาประกาศผู้โชคดี: ผุดจากแม่น้ำกลางจอ กระทงผู้ชนะ (ภาพจำลอง ไม่ใช่ใบที่ลอยในแม่น้ำ) ลอยอยู่กลางตัว
 * ค้างบนจอ hold_seconds แล้วจางหาย — ทุกเครื่องเห็นช่วงเดียวกัน เพราะคิดจากเวลาที่จับ (เทียบเวลา server แล้ว)
 *
 * แอนิเมชันทั้งฉากเป็นเส้นเวลาเดียว (Web Animations API) ตั้ง currentTime = เวลาที่ผ่านไปตั้งแต่จับ
 * เข้ามากลางเหตุการณ์/รีเฟรช จึงเล่นต่อจากจุดที่ควรเป็นพอดี (ช่วงค้าง: fade-in 0.5 วินาที ไม่เล่นช่วงผุดซ้ำ)
 * ใช้แค่ transform / opacity / clip-path (ไม่มี blur filter) ค้าง 5 นาทีบนมือถือได้ไม่หนักเครื่อง
 * ทั้งฉาก pointer-events: none → กดปุ่มที่อยู่ใต้เจ้าแม่ได้ตลอด
 */

/** ความยาวแต่ละช่วง (ms) — แก้ตรงนี้ที่เดียว */
export const GODDESS_PHASES = {
  /** 1. แสงสว่างขึ้นจากผิวน้ำ + หรี่ฉาก */
  glow: 2000,
  /** 2. เจ้าแม่ผุดขึ้นจากน้ำ (ease-out) */
  rise: 3500,
  /** 3. กระทงผุดหน้าเจ้าแม่แล้วลอยไปกลางตัว */
  krathong: 1500,
  /** 4. (ต้นช่วงค้าง) คืนความสว่างฉาก */
  restore: 1000,
  /** เข้ามากลางช่วงค้าง: ค่อยๆ ปรากฏ */
  joinFadeIn: 500,
  /** 5. จางหาย */
  fade: 4000,
} as const;
/** ช่วงโผล่ทั้งหมด (7 วินาที) */
export const GODDESS_APPEAR_MS = GODDESS_PHASES.glow + GODDESS_PHASES.rise + GODDESS_PHASES.krathong;
/** ความยาวทั้งเหตุการณ์ (ms) */
export const goddessTotalMs = (holdSeconds: number) => GODDESS_APPEAR_MS + holdSeconds * 1000 + GODDESS_PHASES.fade;

/** ข้อความบนป้าย (ปรับได้ตามที่เจ้าของงานกำหนด) */
const ANNOUNCE_TITLE = 'ผู้โชคดีได้รับพรจากเจ้าแม่คงคา';
/** หรี่ฉากอื่นลงเท่านี้ ระหว่างแสงขึ้นและผุด */
const DIM = 0.35;

/* ---------- สัดส่วนในภาพ goddess.webp (900×759) ---------- */
const ASPECT = 900 / 759;
/** ฐานคลื่นของภาพ: ส่วนล่างสุดเท่านี้ (สัดส่วนความสูง) อยู่ใต้แนวผิวน้ำ */
const BASE = 0.1;
/** กึ่งกลางลำตัว (ตำแหน่งกระทง) และความกว้างกระทงเทียบความกว้างภาพ */
const BODY = { x: 0.49, y: 0.66 };
const KRATHONG_W = 0.24;
/** ขนาด: มือถือกว้าง ~80% ของจอ / คอมสูงไม่เกิน ~45% ของจอ */
const MOBILE_W = 0.8;
const DESKTOP_H = 0.45;

/** ประกาย (ไม่เกิน 8 จุด): ตำแหน่งในภาพ (สัดส่วน), ขนาด px, คาบ ms (≥3 วินาที ไม่กะพริบเร็ว), เริ่มช้ากว่ากัน */
const SPARKLES = [
  { x: 0.36, y: 0.6, s: 10, d: 4200, o: 0 },
  { x: 0.63, y: 0.58, s: 8, d: 3800, o: 600 },
  { x: 0.42, y: 0.78, s: 7, d: 4600, o: 1300 },
  { x: 0.58, y: 0.8, s: 9, d: 4000, o: 1900 },
  { x: 0.27, y: 0.42, s: 7, d: 5000, o: 900 },
  { x: 0.74, y: 0.4, s: 8, d: 4400, o: 2400 },
  { x: 0.5, y: 0.52, s: 6, d: 3600, o: 3000 },
  { x: 0.33, y: 0.24, s: 6, d: 4800, o: 1600 },
];

interface Props {
  winner: Krathong;
  /** เวลาที่จับ (ตามนาฬิกาเครื่องนี้ ปรับ offset จาก server แล้ว) */
  drawnAtLocal: number;
  holdSeconds: number;
  /** แม่น้ำ: ความกว้าง, ขอบบนบนจอ, แนวผิวน้ำแถวกลาง (px จากขอบบนแม่น้ำ) */
  riverW: number;
  riverTop: number;
  waterY: number;
}

const CLIP_ON = 'inset(-60% -60% 0% -60%)';
const CLIP_OFF = 'inset(-60% -60% -60% -60%)';

export default function RiverGoddess({ winner, drawnAtLocal, holdSeconds, riverW, riverTop, waterY }: Props) {
  /** เวลาที่ผ่านไปตั้งแต่จับ ณ ตอนเริ่มแสดงฉากนี้ (คงที่ตลอดอายุ component) */
  const [startElapsed] = useState(() => Math.max(0, Date.now() - drawnAtLocal));
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [announced, setAnnounced] = useState(() => startElapsed >= GODDESS_APPEAR_MS);

  // ขนาดและตำแหน่ง: กลางจอแนวนอน ฐานคลื่นอยู่ที่ผิวน้ำแถวกลาง ไม่ชน navbar
  const geo = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w = vw < 768 ? vw * MOBILE_W : vh * DESKTOP_H * ASPECT;
    w = Math.min(w, vw * 0.95);
    let h = w / ASPECT;
    const navBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 45;
    const maxH = (riverTop + waterY - navBottom - 8) / (1 - BASE);
    if (h > maxH) {
      h = Math.max(120, maxH);
      w = h * ASPECT;
    }
    const top = waterY - (1 - BASE) * h; // px จากขอบบนแม่น้ำ
    return { w, h, top, left: (riverW - w) / 2, kW: w * KRATHONG_W };
  }, [riverW, riverTop, waterY]);

  const rootRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const glowPulseRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const riseRef = useRef<HTMLDivElement>(null);
  const bobRef = useRef<HTMLDivElement>(null);
  const krathongRef = useRef<HTMLDivElement>(null);
  const krathongBobRef = useRef<HTMLDivElement>(null);
  const sparkleRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const ribbonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const P = GODDESS_PHASES;
    const A = GODDESS_APPEAR_MS;
    const holdEnd = A + holdSeconds * 1000;
    const T = holdEnd + P.fade;
    const o = (ms: number) => Math.min(1, Math.max(0, ms / T));
    const anims: Animation[] = [];

    /** ส่วนของเส้นเวลาหลัก: ยาวเท่าทั้งเหตุการณ์ เริ่มจากเวลาที่ผ่านไปแล้ว */
    const timeline = (el: Element | null, keyframes: Keyframe[]) => {
      if (!el) return;
      const a = el.animate(keyframes, { duration: T, fill: 'both' });
      a.currentTime = startElapsed;
      anims.push(a);
    };
    /** วนซ้ำช่วงค้าง (เริ่มเมื่อถึงเวลา at ของเหตุการณ์) */
    const loop = (el: Element | null, keyframes: Keyframe[], period: number, at: number) => {
      if (!el) return;
      anims.push(
        el.animate(keyframes, {
          duration: period / 2,
          direction: 'alternate',
          iterations: Infinity,
          easing: 'ease-in-out',
          delay: Math.max(0, at - startElapsed),
          fill: 'backwards',
        }),
      );
    };

    // หรี่ฉาก → คืนความสว่างใน 1 วินาทีแรกของช่วงค้าง (ไม่หรี่ตลอด 5 นาที)
    timeline(dimRef.current, [
      { offset: 0, opacity: 0 },
      { offset: o(P.glow), opacity: DIM },
      { offset: o(A), opacity: DIM },
      { offset: o(A + P.restore), opacity: 0 },
      { offset: 1, opacity: 0 },
    ]);
    // แสงจากผิวน้ำ: สว่างขึ้น → เหลือแสงเรืองรอบตัว
    timeline(glowRef.current, [
      { offset: 0, opacity: 0 },
      { offset: o(P.glow), opacity: 1 },
      { offset: o(A), opacity: 1 },
      { offset: o(A + P.restore), opacity: 0.7 },
      { offset: 1, opacity: 0.7 },
    ]);
    // ทั้งฉาก: จางหายพร้อมกันตอนจบ (reduced-motion: ค่อยๆ ปรากฏแทนการผุด)
    timeline(
      contentRef.current,
      reduced
        ? [
            { offset: 0, opacity: 0 },
            { offset: o(P.glow), opacity: 0 },
            { offset: o(A), opacity: 1 },
            { offset: o(holdEnd), opacity: 1 },
            { offset: 1, opacity: 0 },
          ]
        : [
            { offset: 0, opacity: 1 },
            { offset: o(holdEnd), opacity: 1 },
            { offset: 1, opacity: 0 },
          ],
    );
    // ป้ายประกาศ: ขึ้นตอนเริ่มช่วงค้าง
    timeline(ribbonRef.current, [
      { offset: 0, opacity: 0 },
      { offset: o(A), opacity: 0 },
      { offset: o(A + 500), opacity: 1 },
      { offset: 1, opacity: 1 },
    ]);

    if (!reduced) {
      const riseEnd = P.glow + P.rise;
      // ผุดขึ้นจากน้ำ: ตัดภาพใต้แนวผิวน้ำ (clip-path) แล้วเลิกตัดเมื่อผุดเสร็จ
      timeline(clipRef.current, [
        { offset: 0, clipPath: CLIP_ON, easing: 'steps(1, end)' },
        { offset: o(riseEnd), clipPath: CLIP_OFF },
        { offset: 1, clipPath: CLIP_OFF },
      ]);
      timeline(riseRef.current, [
        { offset: 0, transform: `translateY(${geo.h + 8}px)` },
        { offset: o(P.glow), transform: `translateY(${geo.h + 8}px)`, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        { offset: o(riseEnd), transform: 'translateY(0px)' },
        { offset: 1, transform: 'translateY(0px)' },
      ]);
      // กระทงจำลอง: ผุดจากน้ำหน้าเจ้าแม่ → ลอยไปกลางตัว
      const dy = (1 - BASE - BODY.y) * geo.h + geo.kW * 0.2; // จากผิวน้ำขึ้นไปถึงกลางตัว
      timeline(krathongRef.current, [
        { offset: 0, opacity: 0, transform: `translate(-50%, -50%) translateY(${dy}px) scale(0.6)` },
        { offset: o(riseEnd), opacity: 0, transform: `translate(-50%, -50%) translateY(${dy}px) scale(0.6)`, easing: 'ease-out' },
        { offset: o(riseEnd + 350), opacity: 1, transform: `translate(-50%, -50%) translateY(${dy * 0.85}px) scale(0.8)`, easing: 'ease-in-out' },
        { offset: o(A), opacity: 1, transform: 'translate(-50%, -50%) translateY(0px) scale(1)' },
        { offset: 1, opacity: 1, transform: 'translate(-50%, -50%) translateY(0px) scale(1)' },
      ]);
      // ช่วงค้าง: ลอยกระเพื่อมเบาๆ (เจ้าแม่ ±5px คาบ 4 วิ / กระทงคนละเฟส) + แสงเรืองช้าๆ + ประกายลอย
      loop(bobRef.current, [{ transform: 'translateY(-5px)' }, { transform: 'translateY(5px)' }], 4000, A);
      loop(krathongBobRef.current, [{ transform: 'translateY(4px)' }, { transform: 'translateY(-4px)' }], 4400, A + 700);
      loop(glowPulseRef.current, [{ opacity: 1 }, { opacity: 0.7 }], 4000, A);
      SPARKLES.forEach((sp, i) => {
        const el = sparkleRefs.current[i];
        if (!el) return;
        anims.push(
          el.animate(
            [
              { opacity: 0, transform: 'translateY(0px) scale(0.6)' },
              { opacity: 1, transform: 'translateY(-10px) scale(1)', offset: 0.4 },
              { opacity: 0, transform: 'translateY(-22px) scale(0.6)' },
            ],
            { duration: sp.d, iterations: Infinity, easing: 'ease-in-out', delay: Math.max(0, riseEnd - startElapsed) + sp.o, fill: 'backwards' },
          ),
        );
      });
    }

    // เข้ามากลางช่วงค้าง: ค่อยๆ ปรากฏ 0.5 วินาที (ไม่เล่นช่วงผุดซ้ำ)
    if (startElapsed >= A && startElapsed < holdEnd && rootRef.current) {
      anims.push(rootRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: P.joinFadeIn, fill: 'backwards' }));
    }
    // ประกาศชื่อ (aria-live) ครั้งเดียวตอนเริ่มช่วงค้าง
    const announceTimer = startElapsed < A ? window.setTimeout(() => setAnnounced(true), A - startElapsed) : undefined;

    return () => {
      window.clearTimeout(announceTimer);
      for (const a of anims) a.cancel();
    };
  }, [startElapsed, holdSeconds, reduced, geo.h, geo.kW]);

  const krathong = { ...winner, decorations: shownDecorations(winner) };

  return (
    <div ref={rootRef} data-goddess={winner.id} className="pointer-events-none absolute inset-0">
      {/* หรี่ฉากอื่น (ทั้งจอ) */}
      <div ref={dimRef} className="fixed inset-0 bg-[#020818] opacity-0" />

      <div ref={contentRef} className="absolute inset-0">
        {/* แสงจากผิวน้ำ / แสงเรืองรอบตัว (radial gradient ไม่ใช้ blur) */}
        <div
          ref={glowRef}
          className="absolute opacity-0"
          style={{ left: geo.left - geo.w * 0.2, top: geo.top - geo.h * 0.05, width: geo.w * 1.4, height: geo.h * 1.15 }}
        >
          <div
            ref={glowPulseRef}
            className="size-full bg-[radial-gradient(ellipse_50%_55%_at_50%_72%,rgba(255,246,214,0.85),rgba(255,214,120,0.45)_45%,rgba(255,200,90,0)_72%)]"
          />
        </div>

        {/* เจ้าแม่: ตัดที่ผิวน้ำระหว่างผุด */}
        <div
          ref={clipRef}
          className="absolute"
          style={{ left: geo.left, top: geo.top, width: geo.w, height: geo.h, clipPath: reduced ? CLIP_OFF : CLIP_ON }}
        >
          <div ref={riseRef} className="size-full" style={reduced ? undefined : { transform: `translateY(${geo.h + 8}px)` }}>
            <div ref={bobRef} className="relative size-full will-change-transform">
              <img src={goddessArt} alt="" draggable={false} className="block size-full select-none" />
              {SPARKLES.map((sp, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    sparkleRefs.current[i] = el;
                  }}
                  className="absolute opacity-0 [clip-path:polygon(50%_0,62%_38%,100%_50%,62%_62%,50%_100%,38%_62%,0_50%,38%_38%)] bg-[radial-gradient(circle,#fff,#ffe9a3_55%,#f4b83a)]"
                  style={{ left: `${sp.x * 100}%`, top: `${sp.y * 100}%`, width: sp.s * 1.6, height: sp.s * 1.6, display: reduced ? 'none' : undefined }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* กระทงผู้ชนะ (ภาพจำลองตามลำดับ layer เดียวกับ preview) ลอยกลางตัวเจ้าแม่ */}
        <div
          ref={krathongRef}
          className="absolute"
          style={{
            left: geo.left + BODY.x * geo.w,
            top: geo.top + BODY.y * geo.h,
            width: geo.kW,
            transform: 'translate(-50%, -50%)',
            opacity: reduced ? 1 : 0,
          }}
        >
          <div ref={krathongBobRef} className="relative will-change-transform">
            <span className="absolute -inset-[30%] rounded-full bg-[radial-gradient(circle,rgba(255,240,190,0.75),rgba(255,214,120,0.3)_45%,transparent_70%)]" />
            <KrathongIcon type={krathong.type} decorations={krathong.decorations} className="relative block h-auto w-full" />
          </div>
        </div>

        {/* ป้ายประกาศผู้โชคดี (ทอง + ขอบน้ำเงิน แบบโลโก้เว็บ) */}
        <div
          ref={ribbonRef}
          className="absolute left-1/2 w-[min(92vw,460px)] -translate-x-1/2 opacity-0"
          style={{ top: geo.top + geo.h * 0.92 }}
        >
          <div className="bg-[#14246b] p-[3px] [clip-path:polygon(0_0,100%_0,95%_50%,100%_100%,0_100%,5%_50%)]">
            <div
              role="status"
              aria-live="polite"
              className="bg-[linear-gradient(180deg,#ffe9a3_0%,#f4b83a_55%,#c9811b_100%)] px-[9%] py-2 text-center text-[#5a2a00] [clip-path:polygon(0_0,100%_0,95%_50%,100%_100%,0_100%,5%_50%)]"
            >
              {announced && (
                <>
                  <p className="font-head text-[13px] leading-snug sm:text-[15px]">{ANNOUNCE_TITLE}</p>
                  <p className="truncate font-head text-[24px] leading-tight font-semibold sm:text-[30px]">{winner.name}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
