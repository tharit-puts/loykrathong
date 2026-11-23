import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLE_KRATHONGS } from '../data/samples';
import { MAX_VISIBLE, pickLanding } from '../lib/riverLayout';
import { KRATHONG_LABELS, type Krathong, type KrathongType, type NewKrathong } from '../types';

const STORAGE_KEY = 'lk-krathongs-2569';

/**
 * แปลงข้อมูลเก่าใน localStorage ให้เข้ากับรูปแบบปัจจุบัน
 * - กระทงดอกบัว (เลิกใช้แล้ว) และแบบที่ไม่รู้จัก → ใบตอง
 * - กระทงรุ่นก่อนไม่มีของตกแต่ง แต่ภาพเดิมมีดอกไม้อยู่บนกระทง → ใส่ดอกไม้ให้ หน้าตาจะได้ใกล้เดิม
 */
function migrate(raw: Partial<Krathong> & { type?: string }): Krathong {
  const type: KrathongType = raw.type && raw.type in KRATHONG_LABELS ? (raw.type as KrathongType) : 'leaf';
  return {
    ...(raw as Krathong),
    type,
    decorations: Array.isArray(raw.decorations) ? raw.decorations : ['flowers'],
  };
}

function load(): Krathong[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(migrate) : [];
  } catch {
    return [];
  }
}

/**
 * เก็บกระทงที่ผู้ใช้สร้างไว้ใน localStorage
 * (ถ้าต้องการให้ทุกคนเห็นกระทงของกันและกัน ให้เปลี่ยนส่วนนี้ไปเรียก API หลังบ้าน)
 */
export function useKrathongs() {
  const [mine, setMine] = useState<Krathong[]>(load);
  const [latestId, setLatestId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mine));
    } catch {
      /* storage ใช้ไม่ได้ ก็ทำงานต่อแบบไม่บันทึก */
    }
  }, [mine]);

  const all = useMemo(() => [...SAMPLE_KRATHONGS, ...mine], [mine]);
  const allRef = useRef(all);
  allRef.current = all;

  const addKrathong = useCallback((data: NewKrathong) => {
    const now = Date.now();
    // สุ่มแถว บน/กลาง/ล่าง และจุดตกรอบกลางจอ โดยเว้นระยะจากกระทงที่ลอยอยู่ในแถวเดียวกัน ไม่ให้ซ้อนกันมากเกินไป
    // (แม่น้ำกว้างเต็มจอ จึงใช้ความกว้างหน้าต่างแทนความกว้างแม่น้ำ)
    const onRiver = allRef.current.slice(-(MAX_VISIBLE - 1));
    const k: Krathong = {
      ...data,
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      ...pickLanding(onRiver, now, window.innerWidth),
    };
    setMine((prev) => [...prev, k]);
    setLatestId(k.id);
    return k;
  }, []);

  return { all, count: all.length, latestId, addKrathong };
}
