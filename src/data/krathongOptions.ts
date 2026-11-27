import type { Decoration, KrathongType } from '../types';

export interface Option<T> {
  id: T;
  label: string;
  /** คำอธิบายสั้นใต้ชื่อ */
  note?: string;
}

/** Step 1: เลือกกระทง (ตัวแรกเป็นค่าเริ่มต้น) */
export const KRATHONG_OPTIONS: Option<KrathongType>[] = [
  { id: 'leaf', label: 'กระทงใบตอง', note: 'ย่อยสลาย: 14 วัน' },
  { id: 'ice', label: 'กระทงน้ำแข็ง', note: 'ย่อยสลาย: 30 นาที - 1 ชม.' },
  { id: 'bread', label: 'กระทงขนมปัง', note: 'ย่อยสลาย: 3 วัน' },
  { id: 'invisible', label: 'กระทงล่องหน' },
];

/** Step 2: ของตกแต่ง (เลือกได้หลายอัน) */
export const DECORATION_OPTIONS: Option<Decoration>[] = [
  { id: 'flowers', label: 'ดอกไม้รวม' },
  { id: 'coin', label: 'เหรียญ 10', note: 'โชคลาภและความมั่งคั่ง' },
  { id: 'nail', label: 'เล็บ', note: 'ตัดสิ่งไม่ดี เคราะห์ร้าย และความทุกข์ออกจากตัว' },
  { id: 'rice', label: 'ข้าวตอก', note: 'ให้ชีวิตมั่นคงมีการงานที่ดี' },
];
