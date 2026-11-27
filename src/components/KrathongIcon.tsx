import type { HTMLAttributes, ImgHTMLAttributes } from 'react';
import type { Decoration, KrathongType } from '../types';
import bread from '../assets/krathong/krathong-bread.webp';
import ice from '../assets/krathong/krathong-ice.webp';
import invisible from '../assets/krathong/krathong-invisible.webp';
import leaf from '../assets/krathong/krathong-leaf.webp';
import coin from '../assets/krathong/deco-coin.webp';
import flowers from '../assets/krathong/deco-flowers.webp';
import nail from '../assets/krathong/deco-nail.webp';
import rice from '../assets/krathong/deco-rice.webp';
import incense from '../assets/krathong/incense-candle.webp';

const BASE: Record<KrathongType, string> = { leaf, ice, bread, invisible };
const DECO: Record<Decoration | 'top', string> = { flowers, coin, nail, rice, top: incense };

/**
 * ตำแหน่งของตกแต่งบนกระทง (left = จุดกึ่งกลางภาพ, % ของความกว้างกรอบ / bottom = % ของความสูงกรอบ)
 * วัดจากภาพอ้างอิงที่มีกรอบสีกำกับ: ดอกไม้นั่งบนฐาน เล็บ (ซ้าย) กับเหรียญ (ขวา) อยู่หลังดอกไม้ โผล่ด้านข้างนิดเดียว
 * ถ้าไม่ได้เลือกดอกไม้ ก็ไม่มีอะไรบัง จึงเห็นเต็มชิ้น
 * ข้าวตอก: กองกลางกระทง ระหว่างเล็บกับเหรียญ อยู่หลังดอกไม้ และใต้ธูปเทียน (ธูปเทียนปักอยู่ในกองข้าวตอก)
 */
const DECO_POS: Record<Decoration, string> = {
  rice: 'bottom-[39%] left-1/2 w-[46%]',
  flowers: 'bottom-[29%] left-1/2 w-[55.9%]',
  coin: 'bottom-[44.6%] left-[71.9%] w-[25.4%]',
  nail: 'bottom-[44.2%] left-[24.6%] w-[16%]',
};

/** ลำดับวาดจากล่างขึ้นบน (หลังธูปเทียน): เล็บ/เหรียญ → ดอกไม้ — ข้าวตอกวาดก่อนธูปเทียน ดูใน KrathongIcon */
const DECO_ORDER: Decoration[] = ['nail', 'coin', 'flowers'];

const Img = ({ className = '', ...rest }: ImgHTMLAttributes<HTMLImageElement>) => (
  <img alt="" draggable={false} decoding="async" className={`select-none ${className}`} {...rest} />
);

interface Props extends HTMLAttributes<HTMLDivElement> {
  type: KrathongType;
  decorations?: Decoration[];
}

/**
 * กระทง 1 ใบ ซ้อนกันในกรอบสัดส่วน 120:100 จากล่างขึ้นบน: ฐาน → ข้าวตอก → ธูปเทียน → เล็บ/เหรียญ → ดอกไม้
 * แนวน้ำอยู่ที่ 80% ของความสูงกรอบ (River / KrathongPreview วางตำแหน่งโดยอิงค่านี้)
 */
export default function KrathongIcon({ type, decorations = [], className = '', ...rest }: Props) {
  return (
    <div aria-hidden="true" className={`relative aspect-[6/5] ${className}`} {...rest}>
      <Img src={BASE[type]} className="absolute bottom-[13%] left-1/2 w-[84%] max-w-none -translate-x-1/2" />

      {/* ข้าวตอก: กองกลางกระทง (ใต้ธูปเทียน หลังดอกไม้/เล็บ/เหรียญ) */}
      {decorations.includes('rice') && (
        <Img src={DECO.rice} className={`absolute max-w-none -translate-x-1/2 ${DECO_POS.rice}`} />
      )}

      {/* ธูปเทียน: มีทุกใบ ปักกลางกระทง โคนอยู่หลังดอกไม้ (ถ้าไม่มีดอกไม้ก็เห็นโคนสีแดงตั้งบนฐาน) + แสงเทียนกะพริบ */}
      <div className="absolute bottom-[47.8%] left-[51.3%] w-[25.4%] -translate-x-1/2">
        <Img src={incense} className="block w-full" />
        <span className="absolute top-[3%] left-[75%] aspect-square w-[90%] -translate-x-1/2 animate-flick rounded-full bg-[radial-gradient(circle,rgba(255,236,150,0.55),rgba(255,190,60,0.2)_45%,transparent_70%)] mix-blend-screen" />
      </div>

      {DECO_ORDER.filter((d) => decorations.includes(d)).map((d) => (
        <Img key={d} src={DECO[d]} className={`absolute max-w-none -translate-x-1/2 ${DECO_POS[d]}`} />
      ))}
    </div>
  );
}

/** รูปของตกแต่งชิ้นเดียว (หรือธูปเทียน) สำหรับการ์ดใน step 2 */
export function DecorationArt({ item, className = '' }: { item: Decoration | 'top'; className?: string }) {
  return <Img src={DECO[item]} className={`h-auto ${className}`} />;
}
