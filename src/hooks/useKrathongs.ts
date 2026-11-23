import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLE_KRATHONGS } from '../data/samples';
import { MAX_VISIBLE, pickLanding } from '../lib/riverLayout';
import { createKrathong, fetchKrathongs, friendlyError, getKrathongCount } from '../services/krathongs';
import type { Krathong, NewKrathong } from '../types';

/** ดึงกระทงใหม่จากคนอื่นทุกกี่มิลลิวินาที (เฉพาะตอนแท็บเปิดดูอยู่) */
const REFRESH_MS = 60_000;

type Status = 'loading' | 'ready' | 'error';

/**
 * กระทงบนแม่น้ำ + จำนวนทั้งหมด จาก Supabase
 * - แม่น้ำแสดงกระทงใหม่สุด MAX_VISIBLE ใบ / ตัวนับนับจากฐานข้อมูลจริงเท่านั้น
 * - ฐานข้อมูลยังว่าง (หรือเชื่อมต่อไม่ได้) → แม่น้ำแสดงกระทงตัวอย่างแทน ไม่ให้โล่ง
 * - กระทงที่เพิ่งสร้างในเครื่องนี้ ใช้เวลาของเครื่องนี้เป็น createdAt (ไม่ใช่เวลาเซิร์ฟเวอร์)
 *   แอนิเมชันตกลงน้ำและระยะห่างที่ pickLanding คำนวณไว้จึงตรงเสมอ แม้นาฬิกาเครื่องจะคลาดจากเซิร์ฟเวอร์
 */
export function useKrathongs() {
  const [recent, setRecent] = useState<Krathong[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  /** กระทงที่สร้างจากเครื่องนี้ (id → ข้อมูลที่ใช้เวลาเครื่องนี้) ใช้แทนแถวจากฐานข้อมูลเวลาดึงใหม่ */
  const mineRef = useRef(new Map<string, Krathong>());
  /** เคยโหลดจากฐานข้อมูลสำเร็จแล้วอย่างน้อยครั้งหนึ่ง */
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [rows, total] = await Promise.all([fetchKrathongs({ limit: MAX_VISIBLE }), getKrathongCount()]);
      // ฐานข้อมูลเรียงใหม่สุดก่อน แต่แม่น้ำต้องการเก่า → ใหม่ (ใบท้ายสุด = ใหม่สุด)
      setRecent(rows.reverse().map((k) => mineRef.current.get(k.id) ?? k));
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

  const showSamples = status === 'error' || (status === 'ready' && recent.length === 0);
  const all = useMemo(() => (showSamples ? SAMPLE_KRATHONGS : recent), [showSamples, recent]);
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
    mineRef.current.set(k.id, k);
    setRecent((prev) => [...prev.filter((p) => p.id !== k.id), k].slice(-MAX_VISIBLE));
    setCount((c) => (c ?? 0) + 1);
    setStatus('ready');
    setLoadError(null);
    setLatestId(k.id);
    return k;
  }, []);

  return { all, count, status, loadError, latestId, addKrathong, refresh };
}
