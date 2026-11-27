import type { KrathongRow, LuckyDrawStateJson } from '../lib/database.types';
import { getSupabase } from '../lib/supabase';
import type { Krathong } from '../types';
import { fromRow, uniqueChannelName } from './krathongs';

/**
 * เจ้าแม่คงคาประกาศผู้โชคดี: อ่านสถานะจาก server (get_lucky_draw_state) และฟัง Realtime ของ lucky_draws
 * การจับเกิดที่ server เท่านั้น (pg_cron → run_lucky_draw) หน้าเว็บอ่านอย่างเดียว
 */

export interface LuckyDrawState {
  /** นาฬิกาเครื่องนี้ − นาฬิกา server (ms) วัดจากคำขอนี้ */
  offsetMs: number;
  holdSeconds: number;
  /** id ของการจับ (ใช้จำว่าผู้ใช้ปิดเจ้าแม่ของรอบนี้แล้ว) */
  drawId: string | null;
  /** เวลาที่จับ (ms ตามนาฬิกา server) หรือ null ถ้ายังไม่จับ */
  drawnAtServer: number | null;
  /** กระทงผู้ชนะ (สถานะเหรียญ = ณ ตอนจับ) */
  winner: Krathong | null;
}

export async function fetchLuckyDrawState(): Promise<LuckyDrawState> {
  const sentAt = Date.now();
  const { data, error } = await getSupabase().rpc('get_lucky_draw_state').abortSignal(AbortSignal.timeout(10_000));
  const receivedAt = Date.now();
  if (error) throw error;
  const s = data as LuckyDrawStateJson;
  // เวลา server ตอนตอบ ≈ กึ่งกลางระหว่างส่งคำขอกับได้คำตอบ (ตัดผลของเวลาเดินทางของเน็ต)
  const offsetMs = (sentAt + receivedAt) / 2 - Date.parse(s.server_now);
  const drawnAtServer = s.drawn_at ? Date.parse(s.drawn_at) : null;
  let winner: Krathong | null = null;
  if (s.krathong && drawnAtServer !== null) {
    const k = fromRow({
      ...s.krathong,
      created_at: s.drawn_at!,
      wish: '', // ไม่ส่งคำอธิษฐานของผู้ชนะ
      lane: null,
      landing_x: null,
    } as KrathongRow);
    // เหรียญ: ใช้สถานะ ณ ตอนจับ (เด็กเก็บไปทีหลังไม่ต้องอัปเดตตาม)
    const collectedAt = s.krathong.coin_collected_at ? Date.parse(s.krathong.coin_collected_at) : null;
    winner = { ...k, coinCollected: collectedAt !== null && collectedAt <= drawnAtServer };
  }
  return { offsetMs, holdSeconds: s.hold_seconds, drawId: s.draw_id ?? null, drawnAtServer, winner };
}

/** ฟังการเปลี่ยนแปลงของ lucky_draws (จับ / แอดมินลบผลเพื่อรีเซ็ต) → เรียก onChange ให้ไปอ่านสถานะใหม่ */
export function subscribeLuckyDraws(onChange: () => void): () => void {
  let sb: ReturnType<typeof getSupabase>;
  try {
    sb = getSupabase();
  } catch {
    return () => {};
  }
  const channel = sb
    .channel(uniqueChannelName('lucky-draws'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lucky_draws' }, () => onChange())
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
