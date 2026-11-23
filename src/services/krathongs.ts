import { recordCommitTimestamp } from '../lib/serverClock';
import { getSupabase, SupabaseConfigError } from '../lib/supabase';
import type { DbDecoration, DbKrathongType, KrathongRow } from '../lib/database.types';
import type { Decoration, Krathong, KrathongType, Lane } from '../types';

/**
 * อ่าน/เขียนตาราง krathongs ใน Supabase
 * ในหน้าเว็บใช้ชื่อสั้น (leaf, coin) ส่วนฐานข้อมูลใช้ชื่อตามสเปก (banana_leaf, coin10) จึงแปลงค่าที่นี่ที่เดียว
 */

const TYPE_TO_DB: Record<KrathongType, DbKrathongType> = {
  leaf: 'banana_leaf',
  ice: 'ice',
  bread: 'bread',
  invisible: 'invisible',
};
const DECO_TO_DB: Record<Decoration, DbDecoration> = { flowers: 'flowers', coin: 'coin10', nail: 'nail' };

const invert = <K extends string, V extends string>(m: Record<K, V>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;
const TYPE_FROM_DB = invert(TYPE_TO_DB);
const DECO_FROM_DB = invert(DECO_TO_DB);

/** รอนานสุดต่อคำขอ (เน็ตช้า/หลุด จะได้แสดง error แทนการค้างไปเรื่อยๆ) */
const TIMEOUT_MS = 10_000;
const timeout = () => AbortSignal.timeout(TIMEOUT_MS);

class OfflineError extends Error {
  name = 'OfflineError';
}
/** เครื่องออฟไลน์อยู่: แจ้งทันที ไม่ต้องรอจนหมดเวลา */
function db() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError('offline');
  return getSupabase();
}

const COLUMNS = 'id, created_at, name, wish, krathong_type, decorations, lane, landing_x, coin_collected_at';

function fromRow(r: KrathongRow): Krathong {
  return {
    id: r.id,
    createdAt: Date.parse(r.created_at),
    name: r.name,
    wish: r.wish,
    // ค่าที่ไม่รู้จัก (เช่นเพิ่มแบบใหม่ในฐานข้อมูลก่อนอัปเดตเว็บ) แสดงเป็นใบตอง / ข้ามของตกแต่งนั้น
    type: TYPE_FROM_DB[r.krathong_type] ?? 'leaf',
    decorations: (r.decorations ?? []).map((d) => DECO_FROM_DB[d]).filter(Boolean),
    lane: r.lane != null && r.lane >= 0 && r.lane <= 2 ? (r.lane as Lane) : undefined,
    x: r.landing_x ?? undefined,
    coinCollected: r.coin_collected_at != null,
  };
}

export interface CreateKrathongInput {
  name: string;
  wish: string;
  krathongType: KrathongType;
  decorations: Decoration[];
  /** แถวและจุดตกลงน้ำที่เลือกไว้ (pickLanding) */
  lane?: Lane;
  landingX?: number;
}

/** สร้างกระทงใหม่ คืนแถวที่บันทึกแล้ว (id, created_at จากฐานข้อมูล) */
export async function createKrathong(input: CreateKrathongInput): Promise<Krathong> {
  const { data, error } = await db()
    .from('krathongs')
    .insert({
      name: input.name.trim(),
      wish: input.wish.trim(),
      krathong_type: TYPE_TO_DB[input.krathongType],
      decorations: [...new Set(input.decorations)].map((d) => DECO_TO_DB[d]),
      lane: input.lane ?? null,
      landing_x: input.landingX ?? null,
    })
    .select(COLUMNS)
    .abortSignal(timeout())
    .single();
  if (error) throw error;
  return fromRow(data);
}

/**
 * กระทงใหม่สุดก่อน แบ่งหน้าด้วย offset (หน้าแรก offset = 0)
 * ระหว่างเลื่อนดูอาจมีกระทงใหม่เพิ่มมาด้านบน ทำให้หน้าถัดไปมีแถวซ้ำได้: ฝั่งที่เรียกต้องกรองซ้ำด้วย id
 */
export async function fetchKrathongs({ limit = 50, offset = 0 } = {}): Promise<Krathong[]> {
  const { data, error } = await db()
    .from('krathongs')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
    .abortSignal(timeout());
  if (error) throw error;
  return data.map(fromRow);
}

/** จำนวนกระทงทั้งหมด (นับในฐานข้อมูล ไม่ดึงแถวมา) */
export async function getKrathongCount(): Promise<number> {
  const { count, error } = await db()
    .from('krathongs')
    .select('id', { count: 'exact', head: true })
    .abortSignal(timeout());
  if (error) throw error;
  return count ?? 0;
}

export interface KrathongRealtimeHandlers {
  /** มีกระทงใหม่ในฐานข้อมูล (ของใครก็ได้ รวมของเครื่องนี้เอง: ฝั่งที่รับต้องกันซ้ำด้วย id) */
  onInsert: (krathong: Krathong) => void;
  /** เด็กเก็บเหรียญจากกระทงใบนี้ (server ตั้ง coin_collected_at ผ่าน pg_cron) */
  onCoinCollected: (krathongId: string) => void;
}

/** เลขกำกับชื่อ channel ให้ไม่ซ้ำกันในแต่ละครั้งที่ subscribe */
let channelSeq = 0;

/**
 * ฟังการเปลี่ยนแปลงของตาราง krathongs แบบ realtime ใน channel เดียว:
 * INSERT = กระทงใหม่ของคนอื่น / UPDATE ที่มี coin_collected_at = เด็กเก็บเหรียญ
 * ทุกเครื่องที่เปิดเว็บอยู่ได้ event เดียวกันพร้อมกัน / คืนฟังก์ชันยกเลิกการฟัง (removeChannel)
 *
 * ชื่อ channel ต้องไม่ซ้ำทุกครั้ง: supabase-js คืน channel เดิมถ้าชื่อซ้ำ และ removeChannel ถอดออกจากรายการ
 * หลัง server ตอบกลับเท่านั้น → ใน React StrictMode (effect รัน-ล้าง-รันใหม่ทันที) จะได้ channel เก่าที่ subscribe
 * ไปแล้วกลับมา แล้วเพิ่ม listener ไม่ได้
 *
 * ตั้งค่า env ไม่ครบ → ไม่ฟัง (เว็บยังใช้ได้) และการดึงข้อมูลซ้ำเป็นระยะจะตามข้อมูลให้เอง
 */
export function subscribeKrathongChanges({ onInsert, onCoinCollected }: KrathongRealtimeHandlers): () => void {
  let sb: ReturnType<typeof getSupabase>;
  try {
    sb = getSupabase();
  } catch {
    return () => {};
  }
  const channel = sb
    .channel(`krathongs-realtime-${++channelSeq}-${Math.random().toString(36).slice(2, 8)}`)
    .on<KrathongRow>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'krathongs' }, (payload) => {
      const row = payload.new as KrathongRow;
      recordCommitTimestamp(payload.commit_timestamp);
      if (row?.id) onInsert(fromRow(row));
    })
    .on<KrathongRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'krathongs' }, (payload) => {
      const row = payload.new as Partial<KrathongRow>;
      if (row.id && row.coin_collected_at) onCoinCollected(row.id);
    })
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

/** แปลง error ให้เป็นข้อความสุภาพสำหรับผู้ใช้ (รายละเอียดจริงพิมพ์ใน console สำหรับนักพัฒนา) */
export function friendlyError(err: unknown): string {
  console.error('[supabase]', err);
  if (err instanceof SupabaseConfigError) return 'ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง';
  const e = err as { code?: string; name?: string; message?: string } | null;
  if (e?.code === '23514' || e?.code === '23502' || e?.code === '22P02')
    return 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อและคำอธิษฐานอีกครั้ง';
  if (err instanceof OfflineError || (typeof navigator !== 'undefined' && navigator.onLine === false))
    return 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบแล้วลองอีกครั้ง';
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || /abort|timeout/i.test(e?.message ?? ''))
    return 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองอีกครั้ง';
  if (/fetch|network/i.test(e?.message ?? '')) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง';
  return 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
}
