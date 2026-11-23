import { useEffect, useRef, useState } from 'react';
import popupArt from '../assets/bg/welcome-popup.webp';
import popupArtMobile from '../assets/bg/welcome-popup-mobile.webp';
import { MOBILE_PORTRAIT } from '../lib/media';

/** เคยเห็น popup ต้อนรับแล้ว (ปิดแล้วไม่ขึ้นอีก ข้ามวัน/ข้ามแท็บ จนกว่าจะล้างข้อมูลเบราว์เซอร์) */
const SEEN_KEY = 'lk-hasSeenWelcomePopup';

function hasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'true');
  } catch {
    /* storage ใช้ไม่ได้: ปิดได้ตามปกติ แค่ครั้งหน้าจะขึ้นอีก */
  }
}

/**
 * Popup ต้อนรับ "มาลอยกระทงที่ Modena กันเถอะ" ขึ้นครั้งแรกที่เข้าเว็บเท่านั้น
 *
 * ภาพประกอบ 2 แบบ มุมโค้งโปร่งใสในตัวไฟล์ ตำแหน่งข้อความ/ปุ่มเป็น % ของภาพ จึงตรงกับภาพทุกขนาดจอ
 * - แนวนอน welcome-popup.webp (1419×942): ข้อความในป้าย x 17.9–63% y 21.9–41% / ปุ่ม X กึ่งกลาง x 96% y 5.7%
 * - มือถือแนวตั้ง welcome-popup-mobile.webp (893×1614): ข้อความในป้าย x 16.3–83.5% y 25.7–38.7% / ปุ่ม X x 91% y 4.55%
 *   (กรอบข้อความ = ตัวป้ายสี่เหลี่ยม ไม่รวมดอกบัวด้านบนและใบไม้ที่มุมล่าง)
 * - ปุ่ม X ในภาพ → วางปุ่มจริงแบบโปร่งใสทับ / ปุ่มเริ่มลอยกระทง: กึ่งกลางด้านล่าง
 */
export default function WelcomePopup() {
  const [open, setOpen] = useState(() => !hasSeen());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d || !open || d.open) return;
    d.showModal();
    startRef.current?.focus();
  }, [open]);

  /** ปิดทุกทาง (ปุ่มเริ่ม / X / พื้นหลัง / Esc) → จำว่าเคยเห็นแล้ว */
  const close = () => {
    markSeen();
    setOpen(false);
    if (dialogRef.current?.open) dialogRef.current.close();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="welcome-title"
      // Esc
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // กดพื้นหลังนอกกรอบ (คลิกโดนตัว dialog เอง ไม่ใช่ลูกข้างใน)
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="m-auto max-h-[calc(100dvh-16px)] max-w-none overflow-auto bg-transparent p-0 backdrop:bg-[rgba(3,8,24,0.72)]"
    >
      <div className="relative aspect-[1419/942] w-[min(calc(100vw-24px),900px,calc((100dvh-32px)*1.506))] [container-type:inline-size] drop-shadow-[0_18px_40px_rgba(0,0,0,0.5)] transition-[opacity,scale] duration-300 starting:scale-95 starting:opacity-0 mobile-portrait:aspect-[893/1614] mobile-portrait:w-[min(calc(100vw-24px),480px,calc((100dvh-24px)*0.5533))]">
        <picture>
          <source media={MOBILE_PORTRAIT} srcSet={popupArtMobile} />
          <img src={popupArt} alt="" draggable={false} className="absolute inset-0 size-full select-none" />
        </picture>

        {/* ข้อความในป้าย: กึ่งกลางทั้งแนวนอนและแนวตั้ง ขนาดตามความกว้าง popup (cqw) แต่ไม่เล็กกว่า 15px */}
        <div className="absolute top-[21.9%] left-[17.9%] flex h-[19.1%] w-[45.1%] items-center justify-center mobile-portrait:top-[25.7%] mobile-portrait:left-[16.3%] mobile-portrait:h-[13%] mobile-portrait:w-[67.2%]">
          <h2
            id="welcome-title"
            className="text-center font-head text-[max(15px,3.7cqw)] leading-[1.25] font-semibold text-balance text-white [text-shadow:0_2px_0_rgba(0,20,80,0.55),0_0_12px_rgba(120,170,255,0.45)] mobile-portrait:text-[max(17px,7.4cqw)]"
          >
            มาลอยกระทงที่ <span className="text-gold2">Modena</span> กันเถอะ
          </h2>
        </div>

        {/* ปุ่ม X ในภาพ: ปุ่มจริงโปร่งใสทับ (พื้นที่กดอย่างน้อย 44px) */}
        <button
          type="button"
          aria-label="ปิด"
          onClick={close}
          className="absolute top-[5.7%] left-[96%] aspect-square w-[max(44px,4.6cqw)] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors hover:bg-white/25 mobile-portrait:top-[4.55%] mobile-portrait:left-[91%] mobile-portrait:w-[max(44px,9.4cqw)]"
        />

        {/* ปุ่มเริ่มลอยกระทง: ทองเหลือง ตัวน้ำเงินเข้ม + ลูกศร */}
        <button
          ref={startRef}
          type="button"
          onClick={close}
          className="absolute bottom-[4.5%] left-[50%] inline-flex min-h-11 -translate-x-1/2 items-center gap-[0.5em] rounded-full border-2 border-[#fff6c8] bg-[linear-gradient(180deg,#fff27a_0%,#ffd43b_45%,#f5b400_100%)] px-[1.3em] py-[0.45em] font-head text-[max(16px,3.4cqw)] leading-tight font-semibold whitespace-nowrap text-[#14246b] shadow-[0_5px_0_#b97f00,0_10px_24px_rgba(0,0,0,0.35),0_0_24px_rgba(255,220,90,0.55)] transition-[scale,translate,box-shadow] duration-150 hover:scale-105 hover:shadow-[0_5px_0_#b97f00,0_10px_24px_rgba(0,0,0,0.35),0_0_34px_6px_rgba(255,220,90,0.7)] active:translate-y-[3px] active:shadow-[0_2px_0_#b97f00,0_4px_12px_rgba(0,0,0,0.3)] mobile-portrait:bottom-[5%] mobile-portrait:min-h-12 mobile-portrait:text-[max(18px,5.6cqw)]"
        >
          เริ่มลอยกระทง
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[0.9em]" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </dialog>
  );
}
