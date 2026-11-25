import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import toast, { Toaster, useToasterStore, type Toast, type ToastPosition } from 'react-hot-toast';
import kidArt from '../assets/kid/kid.webp';
import KrathongIcon from './KrathongIcon';
import { shownDecorations, type Krathong } from '../types';

/**
 * แจ้งเตือน (toast) ของเว็บ: วาง <NotificationsHost /> หนึ่งตัวที่ root แล้วเรียก notify... จากที่ไหนก็ได้
 *
 * - A สร้างกระทงสำเร็จ (ทุกคนเห็น: ของตัวเองหลังบันทึกสำเร็จ + ของคนอื่นผ่าน realtime) 5 วินาที
 * - B เด็กเก็บเหรียญ (ทุกคนที่ได้ event realtime) 15 วินาที
 * - คอม: มุมบนซ้ายใต้ navbar / มือถือ (จอกว้างไม่ถึง 768px): กลางล่างตรงสะพานไม้ (เผื่อ safe-area ของ iOS)
 * - แสดงพร้อมกันไม่เกิน 3 อัน (อันเก่าสุดหายก่อน) / id ของแต่ละการ์ดผูกกับกระทง กันขึ้นซ้ำ
 * - ข้อความจากผู้ใช้ (ชื่อ คำอธิษฐาน) แสดงผ่าน React เป็นข้อความธรรมดาเสมอ
 */

/** แสดงพร้อมกันได้สูงสุดกี่อัน */
const MAX_VISIBLE_TOASTS = 3;
const DURATION = { created: 5_000, coin: 15_000 };
/** ความสูง navbar (min-h-11 = 44px + เส้นขอบ 1px) + ระยะห่าง */
const TOP_OFFSET = 45 + 12;
const MOBILE_QUERY = '(max-width: 767.98px)';

function position(): ToastPosition {
  return window.matchMedia(MOBILE_QUERY).matches ? 'bottom-center' : 'top-left';
}

/* ---------- การ์ด ---------- */

function Card({ t, children }: { t: Toast; children: ReactNode }) {
  return (
    <div
      className={`pointer-events-auto flex w-[min(360px,calc(100vw-24px))] items-center gap-3 rounded-2xl border-2 border-gold bg-[rgba(20,25,60,0.94)] px-3 py-2.5 text-left text-[#fff7e0] shadow-[0_6px_20px_rgba(0,0,0,0.45),0_0_14px_rgba(232,184,74,0.35)] backdrop-blur-md transition-[opacity,translate] duration-300 starting:-translate-y-2 starting:opacity-0 ${
        t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

/** หน้าเด็ก: ใช้ภาพเด็กเดิม ครอบเฉพาะหน้า (ไม่ทำภาพแยกอีกชุด) */
function KidFace() {
  return (
    <span
      aria-hidden="true"
      className="block size-[52px] shrink-0 rounded-full border-2 border-gold2 bg-[#2a6fb0] bg-no-repeat"
      style={{ backgroundImage: `url(${kidArt})`, backgroundSize: '190% auto', backgroundPosition: '44% 26%' }}
    />
  );
}

function KrathongThumb({ k }: { k: Krathong }) {
  return (
    <KrathongIcon type={k.type} decorations={shownDecorations(k)} className="h-[50px] w-[60px] shrink-0" />
  );
}

/* ---------- ฟังก์ชันแจ้งเตือน ---------- */

/** A: สร้างกระทงสำเร็จ (เรียกหลังบันทึกลงฐานข้อมูลสำเร็จเท่านั้น) */
export function notifyKrathongCreated(k: Krathong) {
  toast.custom(
    (t) => (
      <Card t={t}>
        <KrathongThumb k={k} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-tight text-gold2">ลอยกระทงแล้ว</p>
          <p className="truncate font-head text-[16px] leading-snug font-medium">{k.name}</p>
          <p className="line-clamp-2 text-[13px] leading-snug break-words text-[#dfe6ff]">{k.wish}</p>
        </div>
      </Card>
    ),
    { id: `created-${k.id}`, duration: DURATION.created, position: position() },
  );
}

/** B: เด็กเก็บเหรียญจากกระทงใบนี้ (รูปกระทงไม่มีเหรียญแล้ว) */
export function notifyCoinCollected(k: Krathong) {
  const collected = { ...k, coinCollected: true };
  toast.custom(
    (t) => (
      <Card t={t}>
        <KidFace />
        <KrathongThumb k={collected} />
        <p className="min-w-0 flex-1 text-[14px] leading-snug">
          เด็กเก็บเหรียญจากกระทงของ
          <span className="block truncate font-head text-[16px] font-medium text-gold2">{k.name}</span>
        </p>
      </Card>
    ),
    { id: `coin-${k.id}`, duration: DURATION.coin, position: position() },
  );
}

/** hook สำหรับ component ที่ต้องการแจ้งเตือน */
export function useNotifications() {
  return useMemo(() => ({ notifyKrathongCreated, notifyCoinCollected }), []);
}

/* ---------- ที่วางแจ้งเตือน ---------- */

/**
 * วาง <Toaster /> ไว้ใน popover (top layer) แทนการใช้ z-index
 * เพราะ <dialog> ที่เปิดแบบ modal (popup ต้อนรับ / หน้าต่างสร้างกระทง) อยู่ใน top layer ซึ่ง z-index แซงไม่ได้
 * ทุกครั้งที่มีแจ้งเตือนใหม่หรือ dialog เปิด จะดึง popover ขึ้นบนสุดของ top layer ใหม่
 * เบราว์เซอร์ที่ไม่รองรับ popover: ใช้ z-index สูงแทน (อยู่เหนือทุกอย่างยกเว้น dialog)
 */
export default function NotificationsHost() {
  const ref = useRef<HTMLDivElement>(null);
  const { toasts } = useToasterStore();

  const raise = () => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== 'function') return;
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
    } catch {
      /* ไม่รองรับ: ใช้ z-index แทน */
    }
  };

  useEffect(() => {
    ref.current?.setAttribute('popover', 'manual');
    raise();
    // dialog เปิดทีหลัง → ไปอยู่เหนือแจ้งเตือน จึงดึงแจ้งเตือนกลับขึ้นบนสุด
    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.target instanceof HTMLDialogElement && r.target.open)) raise();
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => mo.disconnect();
  }, []);

  // แจ้งเตือนใหม่ → ขึ้นบนสุด / เกิน 3 อัน → ปิดอันเก่าสุด (ลำดับใน store: ใหม่สุดก่อน)
  const visibleCount = toasts.filter((t) => t.visible).length;
  useEffect(() => {
    raise();
    toasts
      .filter((t) => t.visible)
      .slice(MAX_VISIBLE_TOASTS)
      .forEach((t) => toast.dismiss(t.id));
  }, [visibleCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[9999] m-0 h-full max-h-none w-full max-w-none overflow-visible border-0 bg-transparent p-0"
    >
      <Toaster
        gutter={10}
        containerStyle={{ top: TOP_OFFSET, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', left: 12, right: 12 }}
      />
    </div>
  );
}
