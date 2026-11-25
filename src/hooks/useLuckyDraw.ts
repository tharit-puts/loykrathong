import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLuckyDrawState, subscribeLuckyDraws, type LuckyDrawState } from '../services/luckyDraw';
import type { Krathong } from '../types';
import { goddessTotalMs } from '../components/RiverGoddess';

/** ดึงสถานะซ้ำทุกเท่านี้ (เผื่อ Realtime หลุด) เฉพาะตอนแท็บเปิดดูอยู่ */
const POLL_MS = 30_000;

export interface LuckyDrawView {
  winner: Krathong;
  /** เวลาที่จับ แปลงเป็นนาฬิกาเครื่องนี้แล้ว (ms) — ใช้หาว่าตอนนี้อยู่ช่วงไหนของเหตุการณ์ */
  drawnAtLocal: number;
  holdSeconds: number;
  /** เปลี่ยนทุกครั้งที่ต้องเริ่มฉากใหม่จากเวลาปัจจุบัน (เช่น กลับมาที่แท็บ) */
  epoch: number;
}

/**
 * เจ้าแม่คงคา: สถานะผู้โชคดีจาก server
 * - ตอนโหลด / ได้ event Realtime / ทุก 30 วินาที / กลับมาที่แท็บ → อ่าน get_lucky_draw_state ใหม่
 * - เวลาเทียบกับ server เสมอ (offset จากคำตอบ) เครื่องที่นาฬิกาคลาดก็เห็นช่วงเดียวกับทุกคน
 * - แท็บซ่อนอยู่ → ไม่แสดงฉาก (หยุดแอนิเมชันทั้งหมด) กลับมาแล้วคำนวณช่วงใหม่
 * - เลยเวลาของเหตุการณ์แล้ว → null
 */
export function useLuckyDraw(): LuckyDrawView | null {
  const [state, setState] = useState<LuckyDrawState | null>(null);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [epoch, setEpoch] = useState(0);
  const [, setTick] = useState(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchLuckyDrawState();
      if (!alive.current) return;
      setState((prev) =>
        // ผลเดิม (จับครั้งเดียวกัน) → ไม่ต้องเปลี่ยน state ไม่ให้ฉากเริ่มใหม่
        prev && prev.drawnAtServer === s.drawnAtServer && prev.winner?.id === s.winner?.id && prev.holdSeconds === s.holdSeconds ? prev : s,
      );
    } catch {
      /* อ่านไม่ได้: ไม่แสดงเจ้าแม่ รอรอบถัดไป */
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const unsubscribe = subscribeLuckyDraws(refresh);
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    const onVisibility = () => {
      setHidden(document.hidden);
      if (!document.hidden) {
        setEpoch((e) => e + 1); // เริ่มฉากใหม่จากช่วงปัจจุบัน
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive.current = false;
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  // dev เท่านั้น (ตัดทิ้งตอน build): จำลองผลการจับ เพื่อทดสอบฉากโดยไม่ต้องเปิดกิจกรรมจริง
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__lkSimulateLuckyDraw = (winner: Krathong | null, drawnAgoMs = 0, holdSeconds = 300) =>
      setState(
        winner
          ? { offsetMs: 0, holdSeconds, drawnAtServer: Date.now() - drawnAgoMs, winner }
          : { offsetMs: 0, holdSeconds, drawnAtServer: null, winner: null },
      );
    return () => {
      delete w.__lkSimulateLuckyDraw;
    };
  }, []);

  const view =
    state?.winner && state.drawnAtServer !== null
      ? {
          winner: state.winner,
          drawnAtLocal: state.drawnAtServer + state.offsetMs,
          holdSeconds: state.holdSeconds,
        }
      : null;
  const endsAt = view ? view.drawnAtLocal + goddessTotalMs(view.holdSeconds) : 0;
  const over = !view || Date.now() >= endsAt;

  // จบเหตุการณ์ → render ใหม่ให้ฉากหายไป
  useEffect(() => {
    if (over) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), endsAt - Date.now() + 50);
    return () => window.clearTimeout(t);
  }, [over, endsAt]);

  if (!view || over || hidden) return null;
  return { ...view, epoch };
}
