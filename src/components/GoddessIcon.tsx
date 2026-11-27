import iconArt from '../assets/goddess/goddess-icon.webp';

interface Props {
  pressed: boolean;
  /** เหตุการณ์ยังไม่จบแต่ผู้ใช้ปิดไว้: แสงเรืองเต้นช้าๆ ชวนกดเปิด */
  attention: boolean;
  onClick: () => void;
}

/**
 * ไอคอนเจ้าแม่คงคา (มุมขวาบน) เปิด/ปิดฉากประกาศผู้โชคดี — แสดงตั้งแต่มีผู้ชนะ
 * - ใต้ navbar ชิดขวา (เผื่อ safe-area) / จอ 900px ขึ้นไปอยู่ใต้ QR code (คำนวณจากขนาดการ์ด QR ใน App.tsx)
 *   ไม่ทับ navbar, ตัวนับ, แจ้งเตือน (คอมบนซ้าย / มือถือกลางล่าง)
 * - z-40: เหนือชั้นรับคลิกของเจ้าแม่ (z-30) จึงกดสลับปิดได้ / modal อยู่ใน top layer เหนือกว่า
 * - แสงเต้นคาบ 3.2 วินาที (ไม่กะพริบ) และหยุดเมื่อเครื่องเปิดลดการเคลื่อนไหว
 */
export default function GoddessIcon({ pressed, attention, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label="ดูเจ้าแม่คงคาและผู้โชคดี"
      aria-pressed={pressed}
      onClick={onClick}
      className={`fixed top-[calc(45px+8px+env(safe-area-inset-top,0px))] right-[max(12px,env(safe-area-inset-right,0px))] z-40 size-12 overflow-hidden rounded-full border-2 border-gold bg-[#14246b] p-0 shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition-[scale,box-shadow] duration-200 hover:scale-105 active:scale-95 min-[900px]:top-[calc(45px+16px+clamp(104px,9vw,140px)+24px+12px)] min-[900px]:right-[calc(16px+(clamp(104px,9vw,140px)+24px-48px)/2)] ${
        pressed ? 'ring-[3px] ring-gold2 ring-offset-2 ring-offset-[#14246b]' : ''
      } ${attention ? 'animate-goddess-attn motion-reduce:animate-none' : ''}`}
    >
      <img src={iconArt} alt="" width={96} height={96} draggable={false} className="block size-full select-none" />
    </button>
  );
}
