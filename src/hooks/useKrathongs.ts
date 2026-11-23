import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLE_KRATHONGS } from '../data/samples';
import { MAX_VISIBLE, pickLanding } from '../lib/riverLayout';
import {
  createKrathong,
  fetchKrathongs,
  friendlyError,
  getKrathongCount,
  subscribeCoinCollections,
} from '../services/krathongs';
import { shownDecorations, type Krathong, type NewKrathong } from '../types';

/** ดึงกระทงใหม่จากคนอื่นทุกกี่มิลลิวินาที (เฉพาะตอนแท็บเปิดดูอยู่) */
const REFRESH_MS = 60_000;
/** กันค้าง: ถ้าแอนิเมชันเด็กไม่จบภายในเวลานี้ (เช่น กระทงหลุดจากแม่น้ำระหว่างเล่น) ให้เลิกเล่นเอง */
const KID_MAX_MS = 5_000;

type Status = 'loading' | 'ready' | 'error';

/** เด็กกำลังเก็บเหรียญจากกระทงใบนี้ / bent = ก้มหยิบไปแล้ว (เหรียญบนกระทงหาย) */
export interface Collecting {
  id: string;
  bent: boolean;
}

interface Options {
  /** ตอนนี้เล่นแอนิเมชันเด็กได้ไหม (เช่น modal สร้างกระทงเปิดอยู่ → ไม่เล่น) — เช็ค document.hidden ให้แล้ว */
  canAnimate?: () => boolean;
}

/**
 * กระทงบนแม่น้ำ + จำนวนทั้งหมด จาก Supabase
 * - แม่น้ำแสดงกระทงใหม่สุด MAX_VISIBLE ใบ / ตัวนับนับจากฐานข้อมูลจริงเท่านั้น
 * - ฐานข้อมูลยังว่าง (หรือเชื่อมต่อไม่ได้) → แม่น้ำแสดงกระทงตัวอย่างแทน ไม่ให้โล่ง
 * - กระทงที่เพิ่งสร้างในเครื่องนี้ ใช้เวลาของเครื่องนี้เป็น createdAt (ไม่ใช่เวลาเซิร์ฟเวอร์)
 *   แอนิเมชันตกลงน้ำและระยะห่างที่ pickLanding คำนวณไว้จึงตรงเสมอ แม้นาฬิกาเครื่องจะคลาดจากเซิร์ฟเวอร์
 * - เด็กเก็บเหรียญ: server ตัดสิน (pg_cron) แล้วส่ง event realtime มา
 *   กระทงอยู่บนแม่น้ำ + แท็บเปิดอยู่ + ไม่มี modal → เล่นแอนิเมชัน (เหรียญหายตอนเด็กก้มสุด)
 *   นอกนั้น → ซ่อนเหรียญเงียบๆ ไม่คิวไว้เล่นทีหลัง / ตอนโหลดหน้า ใบที่ถูกเก็บแล้วไม่มีเหรียญตั้งแต่แรก
 */
export function useKrathongs({ canAnimate }: Options = {}) {
  const [recent, setRecent] = useState<Krathong[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [collecting, setCollecting] = useState<Collecting | null>(null);
  /** กระทงที่สร้างจากเครื่องนี้ (id → createdAt ของเครื่องนี้) ใช้แทนเวลาจากฐานข้อมูลเวลาดึงใหม่ */
  const myCreatedAt = useRef(new Map<string, number>());
  /** เคยโหลดจากฐานข้อมูลสำเร็จแล้วอย่างน้อยครั้งหนึ่ง */
  const loadedOnce = useRef(false);

  const recentRef = useRef(recent);
  recentRef.current = recent;
  const collectingRef = useRef(collecting);
  collectingRef.current = collecting;
  const canAnimateRef = useRef(canAnimate);
  canAnimateRef.current = canAnimate;

  const refresh = useCallback(async () => {
    try {
      const [rows, total] = await Promise.all([fetchKrathongs({ limit: MAX_VISIBLE }), getKrathongCount()]);
      // ฐานข้อมูลเรียงใหม่สุดก่อน แต่แม่น้ำต้องการเก่า → ใหม่ (ใบท้ายสุด = ใหม่สุด)
      setRecent(
        rows.reverse().map((k) => {
          const mine = myCreatedAt.current.get(k.id);
          return mine === undefined ? k : { ...k, createdAt: mine };
        }),
      );
      setCount(total);
      setStatus('ready');
      setLoadError(null);
      loadedOnce.current = true;
    } catch (err) {
      const message = friendlyError(err);
      // ดึงรอบถัดๆ ไปไม่สำเร็จ (เคยโหลดได้แล้ว): แสดงข้อมูลเดิมต่อไปเงียบๆ ไม่ขึ้นแถบ error
      if (loadedOnce.current) return;
      setStatus('error');
      setLoadError(message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  // event จาก server: เด็กเก็บเหรียญจากกระทงใบหนึ่ง
  useEffect(() => {
    const onCollected = (id: string) => {
      const target = recentRef.current.find((k) => k.id === id);
      // ไม่อยู่บนแม่น้ำ หรือถูกเก็บไปแล้วในเครื่องนี้ → ไม่ต้องทำอะไร (poll รอบหน้าจะได้ค่าล่าสุดเอง)
      if (!target || target.coinCollected) return;

      setRecent((prev) => prev.map((k) => (k.id === id ? { ...k, coinCollected: true } : k)));
      const animate =
        !document.hidden && !collectingRef.current && (canAnimateRef.current ? canAnimateRef.current() : true);
      if (animate) setCollecting({ id, bent: false });
    };
    // dev เท่านั้น (ตัดทิ้งตอน build): จำลอง event จาก server เพื่อทดสอบแอนิเมชันโดยไม่ต้องรอ cron
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lkSimulateCoinCollected = onCollected;
    return subscribeCoinCollections(onCollected);
  }, []);

  // กันค้าง: เลิกเล่นเองถ้าเด็กไม่เรียก onFinish (เช่น กระทงหลุดจากแม่น้ำ / ย่อจอแล้ว remount)
  const collectingId = collecting?.id;
  useEffect(() => {
    if (!collectingId) return;
    const t = window.setTimeout(() => setCollecting((c) => (c?.id === collectingId ? null : c)), KID_MAX_MS);
    return () => window.clearTimeout(t);
  }, [collectingId]);

  /** เด็กก้มสุด → ซ่อนเหรียญบนกระทง */
  const onKidBend = useCallback((id: string) => {
    setCollecting((c) => (c?.id === id ? { ...c, bent: true } : c));
  }, []);
  /** เด็กดำน้ำหายแล้ว */
  const onKidFinish = useCallback((id: string) => {
    setCollecting((c) => (c?.id === id ? null : c));
  }, []);

  const showSamples = status === 'error' || (status === 'ready' && recent.length === 0);
  const all = useMemo(() => {
    const list = showSamples ? SAMPLE_KRATHONGS : recent;
    // เหรียญที่ถูกเก็บแล้วไม่แสดง ยกเว้นใบที่เด็กกำลังจะหยิบ (แสดงไว้จนเด็กก้มสุด)
    return list.map((k) => {
      if (!k.coinCollected) return k;
      const hold = collecting?.id === k.id && !collecting.bent;
      return { ...k, decorations: shownDecorations(k, hold) };
    });
  }, [showSamples, recent, collecting]);
  const allRef = useRef(all);
  allRef.current = all;

  /**
   * บันทึกกระทงใหม่ลงฐานข้อมูล แล้วค่อยใส่ลงแม่น้ำ
   * ล้มเหลว → throw ข้อความสุภาพ (ฟอร์มแสดงข้อความและไม่ปิด ผู้ใช้ไม่เสียคำอธิษฐานที่พิมพ์ไว้)
   */
  const addKrathong = useCallback(async (data: NewKrathong) => {
    const now = Date.now();
    // สุ่มแถว บน/กลาง/ล่าง และจุดตกรอบกลางจอ โดยเว้นระยะจากกระทงที่ลอยอยู่ในแถวเดียวกัน ไม่ให้ซ้อนกันมากเกินไป
    // (แม่น้ำกว้างเต็มจอ จึงใช้ความกว้างหน้าต่างแทนความกว้างแม่น้ำ)
    const onRiver = allRef.current.slice(-(MAX_VISIBLE - 1));
    const { lane, x } = pickLanding(onRiver, now, window.innerWidth);

    let saved: Krathong;
    try {
      saved = await createKrathong({
        name: data.name,
        wish: data.wish,
        krathongType: data.type,
        decorations: data.decorations,
        lane,
        landingX: x,
      });
    } catch (err) {
      throw new Error(friendlyError(err));
    }

    const k: Krathong = { ...saved, createdAt: now };
    myCreatedAt.current.set(k.id, now);
    setRecent((prev) => [...prev.filter((p) => p.id !== k.id), k].slice(-MAX_VISIBLE));
    setCount((c) => (c ?? 0) + 1);
    setStatus('ready');
    setLoadError(null);
    setLatestId(k.id);
    return k;
  }, []);

  return { all, count, status, loadError, latestId, addKrathong, refresh, collecting, onKidBend, onKidFinish };
}
