/**
 * ประมาณว่านาฬิกาเครื่องนี้คลาดจากเวลา server เท่าไร (offset = เวลาเครื่อง − เวลา server)
 *
 * ทำไมต้องมี: ตำแหน่งกระทงบนแม่น้ำและแอนิเมชันตกลงน้ำคิดจาก "เวลาที่ผ่านไปตั้งแต่สร้าง"
 * created_at มาจาก server แต่ Date.now() มาจากเครื่อง ถ้านาฬิกาเครื่องคลาด (เช่น เร็วไป 5 วินาที)
 * กระทงใหม่ที่ได้จาก realtime จะดูเก่าเกินจนไม่ตกลงน้ำ และระยะห่างกับกระทงที่สร้างเองจะเพี้ยน
 * จึงแปลงเวลา server ทุกค่าเป็นเวลาเครื่องด้วย offset เดียวกัน
 *
 * วิธีวัด: ทุกคำตอบจาก Supabase มี header Date (ละเอียดระดับวินาที)
 * เวลา server ตอนตอบอยู่ในช่วง [Date, Date + 1 วินาที) และเวลาเครื่องตอนนั้นอยู่ระหว่างส่งคำขอถึงได้คำตอบ
 * → offset อยู่ในช่วงหนึ่ง ยิ่งมีคำตอบมาก ยิ่งตัดช่วงให้แคบลง (ใช้ค่ากลางของช่วง)
 * event realtime มีเวลา commit ละเอียดระดับมิลลิวินาที ใช้บีบขอบบนเพิ่มได้ (ได้รับหลัง commit เสมอ)
 */

let lo = -Infinity;
let hi = Infinity;

function narrow(newLo: number, newHi: number) {
  if (newLo > hi || newHi < lo) {
    // ไม่สอดคล้องกับที่วัดไว้ (เช่น ผู้ใช้ตั้งนาฬิกาเครื่องใหม่) → เริ่มวัดใหม่
    lo = newLo;
    hi = newHi;
    return;
  }
  lo = Math.max(lo, newLo);
  hi = Math.min(hi, newHi);
}

/** บันทึกจากคำตอบ HTTP: ส่งคำขอตอน sentAt ได้คำตอบตอน receivedAt (เวลาเครื่อง) พร้อม header Date */
export function recordHttpDate(sentAt: number, receivedAt: number, dateHeader: string | null) {
  const d = dateHeader ? Date.parse(dateHeader) : NaN;
  if (Number.isNaN(d)) return;
  narrow(sentAt - (d + 1000), receivedAt - d);
}

/** บันทึกจาก event realtime: ได้รับตอนนี้ หลัง server commit ตอน commitTimestamp → offset ไม่เกิน (ตอนนี้ − commit) */
export function recordCommitTimestamp(commitTimestamp: string | undefined) {
  const c = commitTimestamp ? Date.parse(commitTimestamp) : NaN;
  if (Number.isNaN(c)) return;
  const bound = Date.now() - c;
  if (bound >= lo) hi = Math.min(hi, bound);
}

/** แปลงเวลา server (ms) เป็นเวลาเครื่อง ยังวัดไม่ได้ → คืนค่าเดิม */
export function serverToLocal(serverMs: number) {
  return Number.isFinite(lo) && Number.isFinite(hi) ? serverMs + (lo + hi) / 2 : serverMs;
}
