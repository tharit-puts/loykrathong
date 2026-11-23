import type { CSSProperties } from 'react';
import KrathongIcon from './KrathongIcon';
import { WaveLayer, type WaveLayerConfig } from './RiverWaves';
import type { Decoration, KrathongType } from '../types';

/** คลื่น 2 ชั้นของภาพตัวอย่าง: กระทงอยู่ระหว่างชั้นหลังกับชั้นหน้า */
const BACK_WAVE: WaveLayerConfig = {
  top: '60%',
  period: 90,
  height: 14,
  speed: 14,
  gradient: 'linear-gradient(180deg, #c4f5ee 0%, #63d4d6 40%, #20a9c4 100%)',
};
const FRONT_WAVE: WaveLayerConfig = {
  top: '74%',
  period: 120,
  height: 16,
  speed: 24,
  gradient: 'linear-gradient(180deg, #92e7e7 0%, #2db6cf 35%, #1b86b8 100%)',
};

/** พลุ: เส้นรัศมี 12 เส้น ขยายออกแล้วจางหาย */
function Firework({ className, color, delay }: { className: string; color: string; delay: string }) {
  return (
    <svg
      viewBox="-50 -50 100 100"
      className={`absolute animate-firework ${className}`}
      style={{ animationDelay: delay } as CSSProperties}
      aria-hidden="true"
    >
      <g stroke={color} strokeWidth="2.4" strokeLinecap="round">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return (
            <line
              key={i}
              x1={Math.cos(a) * 16}
              y1={Math.sin(a) * 16}
              x2={Math.cos(a) * 44}
              y2={Math.sin(a) * 44}
            />
          );
        })}
      </g>
      <g fill={color}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6 + Math.PI / 12;
          return <circle key={i} cx={Math.cos(a) * 30} cy={Math.sin(a) * 30} r="1.8" />;
        })}
      </g>
    </svg>
  );
}

interface Props {
  type: KrathongType;
  decorations: Decoration[];
  className?: string;
}

/** ภาพตัวอย่างกระทงที่กำลังสร้าง อัปเดตตามตัวเลือกทันที */
export default function KrathongPreview({ type, decorations, className = '' }: Props) {
  return (
    <div
      className={`relative overflow-hidden bg-[radial-gradient(120%_70%_at_50%_62%,#ffd27a_0%,#f59a3c_35%,#d9601f_65%,#a8361a_100%)] [container-type:size] ${className}`}
      aria-label="แสดงตัวอย่าง กระทงที่คุณสร้าง"
      role="img"
    >
      <Firework className="top-[6%] left-[8%] w-[22cqw] max-w-[80px]" color="#fff3d1" delay="0s" />
      <Firework className="top-[3%] right-[10%] w-[28cqw] max-w-[110px]" color="#ffd08a" delay="1.1s" />
      <Firework className="top-[22%] right-[30%] w-[16cqw] max-w-[60px]" color="#ffb3c7" delay="1.9s" />

      {/* คำบรรยายด้านบน (มือถือ) */}
      <p className="absolute inset-x-0 top-3 text-center font-head text-[15px] text-white drop-shadow md:hidden">
        แสดงตัวอย่าง กระทงที่คุณสร้าง
      </p>

      <WaveLayer layer={BACK_WAVE} />

      {/* กระทง: แนวน้ำ (80% ของความสูงรูป) วางที่ 66% ของกรอบ ขนาดอิงทั้งกว้างและสูงของกรอบ ไม่ให้ล้นบนจอเตี้ย */}
      <div className="absolute top-[66%] left-1/2 w-[min(64cqw,72cqh,240px)] -translate-x-1/2 -translate-y-[80%]">
        <KrathongIcon
          type={type}
          decorations={decorations}
          className="block h-auto w-full animate-bob drop-shadow-[0_8px_10px_rgba(0,0,0,0.3)]"
        />
      </div>

      <WaveLayer layer={FRONT_WAVE} />

      {/* คำบรรยายด้านล่างในน้ำ (เดสก์ท็อป) */}
      <p className="absolute inset-x-0 bottom-[7%] hidden text-center font-head text-[16px] text-white md:block">
        แสดงตัวอย่าง กระทงที่คุณสร้าง
      </p>
    </div>
  );
}
