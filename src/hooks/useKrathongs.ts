import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { kidCenterX, KID_DURATION_MS } from '../components/CoinKid';
import { notifyCoinCollected, notifyKrathongCreated } from '../components/Notifications';
import { MAX_VISIBLE, lanePath, laneOf, pathPos, pickLanding, xOf } from '../lib/riverLayout';
import { serverToLocal } from '../lib/serverClock';
import {
  createKrathong,
  fetchKrathongs,
  friendlyError,
  getKrathongCount,
  subscribeKrathongChanges,
} from '../services/krathongs';
import { shownDecorations, type Krathong, type NewKrathong } from '../types';

/**
 * ตัวสำรองเผื่อ realtime หลุด: ดึงรายการใหม่ซ้ำทุกกี่มิลลิวินาที (เฉพาะตอนแท็บเปิดดูอยู่)
 * และดึงใหม่ทุกครั้งที่กลับมาที่แท็บ
 */
const REFRESH_MS = 30_000;
/**
 * กระทงที่เพิ่งเข้ามาในเครื่องนี้ (สร้างเอง / ได้จาก realtime) แต่ผลดึงรอบนั้นยังไม่มี
 * (คำขอดึงออกไปก่อนบันทึกเสร็จ) ให้คงไว้บนแม่น้ำอย่างน้อยเท่านี้ ไม่ให้หายแล้วโผล่ใหม่
 * พ้นเวลานี้แล้วถือตามฐานข้อมูล (เช่น ถูกลบจากหลังบ้าน)
 */
const PENDING_MS = 30_000;
/** กันค้าง: ถ้าแอนิเมชันเด็กไม่จบภายในเวลานี้ (เช่น กระทงหลุดจากแม่น้ำระหว่างเล่น) ให้เลิกเล่นเอง */
const KID_MAX_MS = KID_DURATION_MS + 2_000;
/** เด็กโผล่เมื่อกึ่งกลางตัวเด็กอยู่ห่างกึ่งกลางจอไม่เกินเท่านี้ (สัดส่วนความกว้างจอ) ตอนกลางแอนิเมชัน */
const CENTER_ZONE = 0.1;
/** ถ้าเด็กอีกคนกำลังเล่นอยู่ ลองใหม่ทุกเท่านี้ (ms) */
const BUSY_RETRY_MS = 500;

type Status = 'loading' | 'ready' | 'error';

/** เด็กกำลังเก็บเหรียญจากกระทงใบนี้ / bent = ก้มหยิบไปแล้ว (เหรียญบนกระทงหาย) */
export interface Collecting {
  id: string;
  bent: boolean;
}

interface Options {
  /** ตอนนี้เล่นแอนิเมชันเด็กได้ไหม (false = modal สร้างกระทงเปิดอยู่ → ข้ามแอนิเมชัน แต่ยังแจ้งเตือน) */
  canAnimate?: () => boolean;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * อีกกี่ ms เด็กของกระทงใบนี้ถึงจะอยู่กลางจอ (นับจุดกึ่งกลางของแอนิเมชัน เด็กจึงเบี่ยงจากกลางจอเท่ากันทั้งตอนโผล่และตอนดำ)
 * ใช้สูตรตำแหน่งเดียวกับ River (กระทงลอยไปทางขวา)
 * - ยังไม่ถึงกลางจอ → รอจนตรงกลางพอดี
 * - เพิ่งเลยกลางจอไปไม่เกิน CENTER_ZONE → เริ่มเลย (ถ้ารอ ต้องรอกระทงลอยวนกลับมาอีกรอบ)
 * - เลยไปไกลกว่านั้น → รอรอบถัดไป
 */
function msUntilCentered(k: Krathong, now = Date.now()) {
  const W = window.innerWidth;
  const lane = laneOf(k);
  const { width, start, travel, speed } = lanePath(W, lane);
  const mid = now + KID_DURATION_MS / 2;
  const kidCenter = start + pathPos(xOf(k), k.createdAt, lane, W, mid) + kidCenterX(width);
  const past = kidCenter - W / 2;
  if (past >= 0 && past <= CENTER_ZONE * W) return 0;
  return (mod(-past, travel) / speed) * 1000;
}

/**
 * กระทงบนแม่น้ำ + จำนวนทั้งหมด จาก Supabase
 * - แม่น้ำแสดงกระทงใหม่สุด MAX_VISIBLE ใบ / ตัวนับนับจากฐานข้อมูลจริงเท่านั้น
 * - ฐานข้อมูลยังว่าง (หรือเชื่อมต่อไม่ได้) → แม่น้ำว่าง (ไม่มีกระทงตัวอย่าง)
 * - เวลา: createdAt ทุกใบใช้นาฬิกาเครื่องนี้ (สร้างเอง = เวลาเครื่อง / จาก server = แปลงด้วย serverClock)
 * - กระทงใหม่ของคนอื่น: realtime (INSERT) ใช้แถว/จุดตกที่ผู้สร้างสุ่มไว้ ตกลงน้ำด้วยแอนิเมชันเดิม
 *   กันซ้ำด้วย id ตัวนับไม่นับซ้ำ / แจ้งเตือน A ขึ้นทุกเครื่อง
 * - realtime หลุด: ดึงซ้ำทุก 30 วินาที + ตอนกลับมาที่แท็บ แล้ว merge เข้ากับของเดิมโดยไม่ซ้ำ id
 * - เด็กเก็บเหรียญ (server ตัดสินผ่าน pg_cron แล้วส่ง event realtime มา):
 *   - แท็บซ่อนอยู่ → ซ่อนเหรียญเงียบๆ ไม่มีแอนิเมชันและไม่แจ้งเตือน
 *   - modal สร้างกระทงเปิดอยู่ → ซ่อนเหรียญ ไม่มีแอนิเมชัน แต่แจ้งเตือน B ทันที
 *   - กระทงไม่อยู่บนแม่น้ำ → แจ้งเตือน B ทันที
 *   - นอกนั้น → เหรียญยังอยู่ รอให้กระทงลอยมาถึงกลางจอเอง แล้วเด็กโผล่ (ทีละคน) ก้มสุด = เหรียญหาย + แจ้งเตือน B
 *   - โหลดหน้าใหม่: ใบที่ถูกเก็บแล้วไม่มีเหรียญตั้งแต่แรก ไม่เล่น/ไม่แจ้งเตือนย้อนหลัง
 */
export function useKrathongs({ canAnimate }: Options = {}) {
  const [recent, setRecent] = useState<Krathong[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [collecting, setCollecting] = useState<Collecting | null>(null);
  /** เหรียญที่ถูกเก็บแล้วแต่ยังแสดงไว้ (รอเด็กมาถึงกลางจอ / เด็กยังไม่ก้มสุด) */
  const [heldCoins, setHeldCoins] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * createdAt ตามนาฬิกาเครื่องนี้ของกระทงแต่ละใบ (id → ms) กำหนดครั้งเดียวตอนเห็นครั้งแรก แล้วใช้ค่าเดิมตลอด
   * - สร้างเอง: เวลาเครื่องตอนสร้าง / จากฐานข้อมูลหรือ realtime: created_at แปลงเป็นเวลาเครื่อง (serverClock)
   * ตำแหน่งบนแม่น้ำ แอนิเมชันตกลงน้ำ และระยะห่างจึงใช้นาฬิกาเดียวกันหมด แม้นาฬิกาเครื่องคลาดจาก server
   * และไม่กระโดดเมื่อดึงข้อมูลรอบถัดไป
   */
  const localCreatedAt = useRef(new Map<string, number>());
  const toLocalTime = (k: Krathong): Krathong => {
    let t = localCreatedAt.current.get(k.id);
    if (t === undefined) {
      t = serverToLocal(k.createdAt);
      localCreatedAt.current.set(k.id, t);
    }
    return t === k.createdAt ? k : { ...k, createdAt: t };
  };
  const toLocalTimeRef = useRef(toLocalTime);
  /** id ที่นับรวมในตัวนับแล้ว (กันนับซ้ำเมื่อได้กระทงใบเดียวกันจากหลายทาง: สร้างเอง / realtime / ดึงซ้ำ) */
  const countedIds = useRef(new Set<string>());
  /** กระทงที่เพิ่งเข้ามาในเครื่องนี้ (id → เวลาที่เข้ามาตามนาฬิกาเครื่อง / created_at ตามเวลา server) ดู PENDING_MS */
  const pendingSince = useRef(new Map<string, { at: number; serverCreatedAt: number }>());
  /** เคยโหลดจากฐานข้อมูลสำเร็จแล้วอย่างน้อยครั้งหนึ่ง */
  const loadedOnce = useRef(false);
  /** คิวเด็ก: กระทงที่รอให้ลอยมาถึงกลางจอ (id → timer) และข้อมูลกระทงจาก event (ใช้แจ้งเตือน) */
  const kidTimers = useRef(new Map<string, number>());
  const kidTargets = useRef(new Map<string, Krathong>());

  const recentRef = useRef(recent);
  recentRef.current = recent;
  const collectingRef = useRef(collecting);
  collectingRef.current = collecting;
  const canAnimateRef = useRef(canAnimate);
  canAnimateRef.current = canAnimate;

  const refresh = useCallback(async () => {
    try {
      const [rows, total] = await Promise.all([fetchKrathongs({ limit: MAX_VISIBLE }), getKrathongCount()]);
      const newestFetched = rows.length ? Math.max(...rows.map((k) => k.createdAt)) : -Infinity;
      // ฐานข้อมูลเรียงใหม่สุดก่อน แต่แม่น้ำต้องการเก่า → ใหม่ (ใบท้ายสุด = ใหม่สุด)
      const fetched = rows.reverse().map(toLocalTimeRef.current);
      const fetchedIds = new Set(fetched.map((k) => k.id));
      // merge: ใบที่เพิ่งเข้ามาแต่ผลดึงรอบนี้ยังไม่มี → คงไว้ต่อท้าย (ใหม่สุด) ไม่ซ้ำ id
      const now = Date.now();
      for (const [id, p] of pendingSince.current) if (now - p.at > PENDING_MS) pendingSince.current.delete(id);
      // นับเพิ่มเฉพาะใบที่ใหม่กว่าใบใหม่สุดที่ดึงมา (ใบที่เก่ากว่าแต่ไม่อยู่ในผลดึง = อยู่ในผลนับแล้ว แค่ล้นจาก MAX_VISIBLE)
      const notYetFetched = [...pendingSince.current].filter(
        ([id, p]) => !fetchedIds.has(id) && p.serverCreatedAt > newestFetched,
      );
      setRecent((prev) =>
        [...fetched, ...prev.filter((k) => !fetchedIds.has(k.id) && pendingSince.current.has(k.id))].slice(-MAX_VISIBLE),
      );
      for (const id of fetchedIds) countedIds.current.add(id);
      // ตัวนับจากฐานข้อมูล + ใบที่เพิ่งเข้ามาแต่ยังไม่ทันอยู่ในผลนับรอบนี้
      setCount(total + notYetFetched.length);
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

  /* ---------- คิวเด็กเก็บเหรียญ ---------- */

  const releaseCoin = useCallback((id: string) => {
    setHeldCoins((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /** ข้อมูลกระทงล่าสุดสำหรับแจ้งเตือน (บนแม่น้ำ หรือจาก event) */
  const targetOf = (id: string) => recentRef.current.find((k) => k.id === id) ?? kidTargets.current.get(id);

  /** เลิกรอเด็ก: เหรียญหาย (+ แจ้งเตือนถ้า notify) */
  const dropKid = useCallback(
    (id: string, notify: boolean) => {
      window.clearTimeout(kidTimers.current.get(id));
      kidTimers.current.delete(id);
      releaseCoin(id);
      const k = targetOf(id);
      kidTargets.current.delete(id);
      if (notify && k) notifyCoinCollected(k);
    },
    [releaseCoin],
  );

  /** ตั้งเวลาให้เด็กโผล่ตอนกระทงลอยมาถึงกลางจอ */
  const scheduleKidRef = useRef<(id: string) => void>(() => {});
  const tryStartKid = (id: string) => {
    kidTimers.current.delete(id);
    const k = recentRef.current.find((p) => p.id === id);
    if (!k) return dropKid(id, true); // หลุดจากแม่น้ำระหว่างรอ
    if (document.hidden) return dropKid(id, false); // แท็บซ่อน: ข้ามทั้งแอนิเมชันและแจ้งเตือน
    if (canAnimateRef.current && !canAnimateRef.current()) return dropKid(id, true); // modal เปิด: แจ้งเตือนอย่างเดียว
    if (collectingRef.current) {
      // เด็กอีกคนกำลังเล่น: รอให้จบ แล้วเช็คใหม่ว่ายังอยู่กลางจอไหม (ไม่อยู่ = รอรอบถัดไป)
      kidTimers.current.set(id, window.setTimeout(() => scheduleKidRef.current(id), BUSY_RETRY_MS));
      return;
    }
    if (msUntilCentered(k) > 0) return scheduleKidRef.current(id); // ย่อ/ขยายจอระหว่างรอ → คำนวณใหม่
    setCollecting({ id, bent: false });
  };
  scheduleKidRef.current = (id: string) => {
    const k = recentRef.current.find((p) => p.id === id);
    if (!k) return dropKid(id, true);
    kidTimers.current.set(id, window.setTimeout(() => tryStartKid(id), msUntilCentered(k)));
  };

  // event จาก server (realtime): กระทงใหม่ / เด็กเก็บเหรียญ — channel เดียว ถอดตอน unmount
  useEffect(() => {
    const onInsert = (k: Krathong) => {
      // ซ้ำ: อยู่บนแม่น้ำแล้ว หรือนับไปแล้ว (เช่น กระทงที่เครื่องนี้สร้างเอง ได้ลงน้ำจาก addKrathong แล้ว)
      if (countedIds.current.has(k.id) || recentRef.current.some((p) => p.id === k.id)) return;
      countedIds.current.add(k.id);
      pendingSince.current.set(k.id, { at: Date.now(), serverCreatedAt: k.createdAt });
      // ใช้แถว/จุดตกที่ผู้สร้างสุ่มไว้ (ไม่สุ่มใหม่ ระยะห่างจึงตรงกับทุกเครื่อง) / createdAt = เวลา server แปลงเป็นเวลาเครื่อง
      // River เห็นว่าเพิ่งสร้าง (ไม่เกิน 2 วินาที) จึงเล่นแอนิเมชันตกลงน้ำแบบเดียวกับกระทงที่สร้างเอง
      const local = toLocalTimeRef.current(k);
      setRecent((prev) => [...prev.filter((p) => p.id !== k.id), local].slice(-MAX_VISIBLE));
      setCount((c) => (c === null ? c : c + 1));
      notifyKrathongCreated(local);
    };

    const onCollected = (k: Krathong) => {
      const id = k.id;
      if (kidTimers.current.has(id) || kidTargets.current.has(id) || collectingRef.current?.id === id) return; // ซ้ำ
      const target = recentRef.current.find((p) => p.id === id);
      if (target?.coinCollected) return; // ถูกเก็บไปแล้วในเครื่องนี้
      if (document.hidden) {
        // แท็บซ่อน: ซ่อนเหรียญเงียบๆ
        if (target) setRecent((prev) => prev.map((p) => (p.id === id ? { ...p, coinCollected: true } : p)));
        return;
      }
      if (!target) return notifyCoinCollected(k); // ไม่อยู่บนแม่น้ำ: แจ้งเตือนอย่างเดียว

      setRecent((prev) => prev.map((p) => (p.id === id ? { ...p, coinCollected: true } : p)));
      if (canAnimateRef.current && !canAnimateRef.current()) return notifyCoinCollected(target); // modal เปิด
      // เล่นแอนิเมชัน: แสดงเหรียญไว้ก่อน รอกระทงลอยมาถึงกลางจอ
      kidTargets.current.set(id, target);
      setHeldCoins((prev) => new Set(prev).add(id));
      scheduleKidRef.current(id);
    };

    // dev เท่านั้น (ตัดทิ้งตอน build): จำลอง event จาก server เพื่อทดสอบโดยไม่ต้องรอ cron
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__lkSimulateCoinCollected = (id: string) => {
        const k = recentRef.current.find((p) => p.id === id);
        onCollected(k ?? { id, name: '?', wish: '', type: 'leaf', decorations: ['coin'], createdAt: Date.now() });
      };
      (window as unknown as Record<string, unknown>).__lkMsUntilCentered = (id: string) => {
        const k = recentRef.current.find((p) => p.id === id);
        return k ? msUntilCentered(k) : null;
      };
    }
    const unsubscribe = subscribeKrathongChanges({ onInsert, onCoinCollected: onCollected });
    const timers = kidTimers.current;
    return () => {
      unsubscribe();
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // กันค้าง: เลิกเล่นเองถ้าเด็กไม่เรียก onFinish (เช่น กระทงหลุดจากแม่น้ำ / ย่อจอแล้ว remount)
  const collectingId = collecting?.id;
  useEffect(() => {
    if (!collectingId) return;
    const t = window.setTimeout(() => {
      setCollecting((c) => (c?.id === collectingId ? null : c));
      dropKid(collectingId, false);
    }, KID_MAX_MS);
    return () => window.clearTimeout(t);
  }, [collectingId, dropKid]);

  /** เด็กก้มสุด → ซ่อนเหรียญบนกระทง + แจ้งเตือน B */
  const onKidBend = useCallback(
    (id: string) => {
      setCollecting((c) => (c?.id === id ? { ...c, bent: true } : c));
      dropKid(id, true);
    },
    [dropKid],
  );
  /** เด็กดำน้ำหายแล้ว */
  const onKidFinish = useCallback((id: string) => {
    setCollecting((c) => (c?.id === id ? null : c));
  }, []);

  const all = useMemo(
    () =>
      // เหรียญที่ถูกเก็บแล้วไม่แสดง ยกเว้นใบที่เด็กกำลังจะหยิบ (แสดงไว้จนเด็กก้มสุด)
      recent.map((k) => (k.coinCollected ? { ...k, decorations: shownDecorations(k, heldCoins.has(k.id)) } : k)),
    [recent, heldCoins],
  );
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
    localCreatedAt.current.set(k.id, now);
    pendingSince.current.set(k.id, { at: Date.now(), serverCreatedAt: saved.createdAt });
    setRecent((prev) => [...prev.filter((p) => p.id !== k.id), k].slice(-MAX_VISIBLE));
    // event realtime ของใบนี้อาจมาถึงก่อนบันทึกเสร็จ (นับไปแล้ว) → ไม่นับซ้ำ
    if (!countedIds.current.has(k.id)) {
      countedIds.current.add(k.id);
      setCount((c) => (c ?? 0) + 1);
    }
    setStatus('ready');
    setLoadError(null);
    setLatestId(k.id);
    // แจ้งเตือน A หลังบันทึกสำเร็จเท่านั้น (id เดียวกับที่ realtime ใช้ จึงไม่ขึ้นซ้ำ)
    notifyKrathongCreated(k);
    return k;
  }, []);

  return { all, count, status, loadError, latestId, addKrathong, refresh, collecting, onKidBend, onKidFinish };
}
