import { useCallback, useEffect, useRef, useState } from 'react';
import { GODDESS_APPEAR_MS, GODDESS_PHASES, REPLAY_SECONDS, goddessTotalMs } from '../components/RiverGoddess';
import { fetchLuckyDrawState, subscribeLuckyDraws, type LuckyDrawState } from '../services/luckyDraw';
import type { Krathong } from '../types';

/** ดึงสถานะซ้ำทุกเท่านี้ (เผื่อ Realtime หลุด) เฉพาะตอนแท็บเปิดดูอยู่ */
const POLL_MS = 30_000;
/** เก็บ id ของการจับที่ผู้ใช้ปิดเจ้าแม่ไปแล้ว (รอบใหม่ id ใหม่ → ไม่ติดสถานะปิดจากรอบเก่า) */
const DISMISSED_KEY = 'lk-goddess-dismissed';

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
};
const writeDismissed = (drawId: string | null) => {
  try {
    if (drawId) localStorage.setItem(DISMISSED_KEY, drawId);
    else localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* storage ใช้ไม่ได้: ปิดได้ตามปกติ แค่รีเฟรชแล้วจะขึ้นอีก */
  }
};

/** ฉากเจ้าแม่ที่ต้องแสดงตอนนี้ */
export interface GoddessScene {
  /** เปลี่ยนเมื่อต้องเริ่มฉากใหม่จากเวลาปัจจุบัน (เปิดใหม่ / กลับมาที่แท็บ / ดูซ้ำ) */
  key: string;
  winner: Krathong;
  /** เวลาเริ่มเหตุการณ์ตามนาฬิกาเครื่องนี้ (ปรับ offset จาก server แล้ว) */
  drawnAtLocal: number;
  holdSeconds: number;
  /** ผู้ใช้สั่งปิด กำลังจางออก */
  closing: boolean;
}

export interface LuckyDrawUi {
  scene: GoddessScene | null;
  /** ไอคอนเจ้าแม่มุมขวาบน: แสดงตั้งแต่มีผู้ชนะ */
  icon: { visible: boolean; pressed: boolean; attention: boolean };
  /** กดไอคอน: เปิด/ปิด */
  toggle: () => void;
  /** แตะ/คลิก/Esc บนฉาก */
  dismiss: () => void;
  /** ฉากจางออกเสร็จแล้ว */
  onClosed: () => void;
}

/**
 * เจ้าแม่คงคา: สถานะผู้โชคดีจาก server + การเปิด/ปิดของผู้ใช้เครื่องนี้
 * - อ่าน get_lucky_draw_state ตอนโหลด / event Realtime / ทุก 30 วินาที / กลับมาที่แท็บ
 * - เวลาเทียบกับ server เสมอ (offset) เครื่องที่นาฬิกาคลาดก็เห็นช่วงเดียวกับทุกคน
 * - ผู้ใช้ปิด → จำใน localStorage (ผูกกับ draw id) รีเฟรชแล้วไม่เด้งกลับ ต้องกดไอคอนเปิดเอง
 * - กดไอคอนระหว่างเหตุการณ์ → เห็นช่วงเดียวกับทุกคน (ไม่เริ่มใหม่ ไม่ต่อเวลา)
 * - กดไอคอนหลังเหตุการณ์จบ → ดูซ้ำในท่าค้าง ค้างไว้จนกว่าผู้ใช้จะปิดเอง (REPLAY_SECONDS)
 * - แท็บซ่อนอยู่ → ไม่แสดงฉาก (หยุดแอนิเมชันทั้งหมด) กลับมาแล้วคำนวณช่วงใหม่
 */
export function useLuckyDraw(): LuckyDrawUi {
  const [state, setState] = useState<LuckyDrawState | null>(null);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [epoch, setEpoch] = useState(0);
  const [dismissedId, setDismissedId] = useState<string | null>(readDismissed);
  const [replayStart, setReplayStart] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [, setTick] = useState(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchLuckyDrawState();
      if (!alive.current) return;
      setState((prev) =>
        // ผลเดิม (จับครั้งเดียวกัน) → ไม่เปลี่ยน state ไม่ให้ฉากเริ่มใหม่
        prev && prev.drawId === s.drawId && prev.holdSeconds === s.holdSeconds ? prev : s,
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
    w.__lkSimulateLuckyDraw = (winner: Krathong | null, drawnAgoMs = 0, holdSeconds = 120, drawId?: string) =>
      setState(
        winner
          ? { offsetMs: 0, holdSeconds, drawId: drawId ?? `sim-${winner.id}`, drawnAtServer: Date.now() - drawnAgoMs, winner }
          : { offsetMs: 0, holdSeconds, drawId: null, drawnAtServer: null, winner: null },
      );
    return () => {
      delete w.__lkSimulateLuckyDraw;
    };
  }, []);

  const draw =
    state?.winner && state.drawnAtServer !== null && state.drawId
      ? { id: state.drawId, winner: state.winner, drawnAtLocal: state.drawnAtServer + state.offsetMs, holdSeconds: state.holdSeconds }
      : null;
  const now = Date.now();
  const liveEnd = draw ? draw.drawnAtLocal + goddessTotalMs(draw.holdSeconds) : 0;
  const over = !draw || now >= liveEnd;
  const dismissed = !!draw && dismissedId === draw.id;

  // ดูซ้ำหลังจบ: เริ่มที่ท่าค้าง (ข้ามการหรี่ฉาก) ค้างไว้จนกว่าผู้ใช้จะปิด
  const replayOffset = GODDESS_APPEAR_MS + GODDESS_PHASES.restore;
  const replayHold = REPLAY_SECONDS + GODDESS_PHASES.restore / 1000;
  const replayEnd = replayStart !== null ? replayStart - replayOffset + goddessTotalMs(replayHold) : 0;
  const replaying = replayStart !== null && now < replayEnd;

  let scene: GoddessScene | null = null;
  if (draw && !hidden) {
    if (replaying) {
      scene = { key: `${draw.id}-replay-${replayStart}`, winner: draw.winner, drawnAtLocal: replayStart! - replayOffset, holdSeconds: replayHold, closing };
    } else if (!over && !dismissed) {
      scene = { key: `${draw.id}-live-${epoch}`, winner: draw.winner, drawnAtLocal: draw.drawnAtLocal, holdSeconds: draw.holdSeconds, closing };
    }
  }

  // ฉากหายไปเอง (จบเหตุการณ์/ซ่อนแท็บ) ระหว่างกำลังปิด → ล้างสถานะ ไม่ให้ติดไปกับฉากถัดไป
  const sceneKey = scene?.key ?? null;
  useEffect(() => {
    if (!sceneKey) setClosing(false);
  }, [sceneKey]);

  // render ใหม่ตอนเหตุการณ์จบ / ดูซ้ำจบ (ให้ฉากหายและไอคอนเปลี่ยนสถานะ)
  const nextBoundary = Math.min(...[liveEnd, replayEnd].filter((t) => t > now));
  useEffect(() => {
    if (!Number.isFinite(nextBoundary)) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), nextBoundary - Date.now() + 50);
    return () => window.clearTimeout(t);
  }, [nextBoundary]);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const replayingRef = useRef(replaying);
  replayingRef.current = replaying;

  const dismiss = useCallback(() => {
    if (sceneRef.current) setClosing(true);
  }, []);

  const onClosed = useCallback(() => {
    setClosing(false);
    if (replayingRef.current) {
      setReplayStart(null);
      return;
    }
    const id = drawRef.current?.id ?? null;
    writeDismissed(id);
    setDismissedId(id);
  }, []);

  const toggle = useCallback(() => {
    const d = drawRef.current;
    if (!d) return;
    if (sceneRef.current) {
      setClosing(true);
      return;
    }
    if (Date.now() < d.drawnAtLocal + goddessTotalMs(d.holdSeconds)) {
      // ระหว่างเหตุการณ์: กลับเข้าช่วงเดียวกับทุกคน (คำนวณจากเวลา server ไม่เริ่มใหม่)
      writeDismissed(null);
      setDismissedId(null);
      setEpoch((e) => e + 1);
    } else {
      setReplayStart(Date.now());
    }
  }, []);

  return {
    scene,
    icon: {
      visible: !!draw,
      pressed: !!scene && !closing,
      attention: !over && dismissed && !scene,
    },
    toggle,
    dismiss,
    onClosed,
  };
}
