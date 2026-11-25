import { useCallback, useEffect, useRef, useState } from 'react';
import KrathongIcon from './KrathongIcon';
import Modal from './Modal';
import { fetchKrathongs, friendlyError } from '../services/krathongs';
import { KRATHONG_LABELS, shownDecorations, type Krathong } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** โหลดทีละกี่ใบ */
const PAGE_SIZE = 50;

/**
 * คำอธิษฐานทั้งหมด (ใหม่สุดก่อน) ดึงจาก Supabase ทุกครั้งที่เปิด แบ่งหน้าด้วยปุ่ม "ดูเพิ่มเติม"
 * ถ้ายังไม่มีใครลอยกระทง แสดงข้อความว่ายังไม่มีคำอธิษฐาน
 */
export default function WishesModal({ open, onClose }: Props) {
  const [items, setItems] = useState<Krathong[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** กันผลลัพธ์จากการโหลดรอบเก่ามาทับ (ปิดแล้วเปิดใหม่เร็วๆ) */
  const reqId = useRef(0);

  const load = useCallback(async (offset: number) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchKrathongs({ limit: PAGE_SIZE, offset });
      if (id !== reqId.current) return;
      // ระหว่างเลื่อนดูอาจมีกระทงใหม่เพิ่มด้านบน ทำให้หน้าถัดไปมีแถวซ้ำ → กรองด้วย id
      setItems((prev) => {
        const base = offset === 0 ? [] : prev;
        const seen = new Set(base.map((k) => k.id));
        return [...base, ...page.filter((k) => !seen.has(k.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) setError(friendlyError(err));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load(0);
  }, [open, load]);

  const list = items;

  return (
    <Modal open={open} title="คำอธิษฐานทั้งหมด" onClose={onClose}>
      <div className="grid max-h-[60vh] gap-2.5 overflow-auto" aria-busy={loading}>
        {list.length > 0 && (
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {list.map((k) => (
              <li key={k.id} className="flex gap-3 rounded-[14px] bg-bg2 p-3">
                <KrathongIcon type={k.type} decorations={shownDecorations(k)} className="h-[47px] w-14 flex-none" />
                <div className="min-w-0 break-words">
                  <b className="font-head font-medium">{k.name}</b>
                  <div className="text-[13px] text-mute">กระทง{KRATHONG_LABELS[k.type]}</div>
                  <div>{k.wish}</div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {loaded && !loading && !error && items.length === 0 && (
          <p className="py-6 text-center text-mute">ยังไม่มีคำอธิษฐาน มาเป็นคนแรกที่ลอยกระทงกันเถอะ</p>
        )}

        {loading && (
          <p role="status" className="py-3 text-center text-mute">
            กำลังโหลดคำอธิษฐาน…
          </p>
        )}

        {error && (
          <div role="alert" className="grid justify-items-center gap-2 rounded-[14px] bg-bg2 p-4 text-center">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => load(items.length)}
              className="min-h-11 rounded-full border border-gold px-5 font-head text-gold2 hover:bg-white/5"
            >
              ลองอีกครั้ง
            </button>
          </div>
        )}

        {hasMore && !loading && !error && (
          <button
            type="button"
            onClick={() => load(items.length)}
            className="mx-auto min-h-11 rounded-full border border-line px-5 font-head text-ink hover:bg-white/5"
          >
            ดูเพิ่มเติม
          </button>
        )}
      </div>
    </Modal>
  );
}
