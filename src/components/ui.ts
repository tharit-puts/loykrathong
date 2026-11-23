/** ชุดคลาส Tailwind ที่ใช้ซ้ำหลายคอมโพเนนต์ */

/**
 * ปุ่มหลักสีชมพู: ขอบขาว เงาด้านล่าง + glow ชมพู (สี pink-glow ใน @theme) กระพริบเบาๆ ด้วย animate-pulse-glow
 * hover/active หยุด animation ก่อน ไม่งั้น box-shadow ใน keyframes จะทับ glow ตอน hover และเงาตอนกด
 */
export const cta =
  'inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full border-[3px] border-white px-[38px] font-head text-[20px] text-white [text-shadow:0_2px_2px_rgba(120,20,70,0.5)] ' +
  'bg-[linear-gradient(180deg,#ff7aa3,var(--color-pink2))] shadow-[0_6px_0_rgba(150,30,90,0.55),0_10px_24px_rgba(0,0,0,0.35),0_0_22px_4px_var(--color-pink-glow)] ' +
  'animate-pulse-glow motion-reduce:animate-none transition-[scale,translate,box-shadow] duration-150 ' +
  'hover:scale-105 hover:animate-none hover:shadow-[0_6px_0_rgba(150,30,90,0.55),0_10px_24px_rgba(0,0,0,0.35),0_0_32px_10px_var(--color-pink-glow)] ' +
  'active:translate-y-[3px] active:animate-none active:shadow-[0_3px_0_rgba(150,30,90,0.55),0_5px_12px_rgba(0,0,0,0.3),0_0_22px_4px_var(--color-pink-glow)] ' +
  'max-[600px]:px-7 max-[600px]:text-[18px]';
