import type { Krathong } from '../types';

/** กระทงตัวอย่าง แสดงป้าย "ตัวอย่าง" ในหน้ารวมคำอธิษฐาน */
export const SAMPLE_KRATHONGS: Krathong[] = [
  {
    id: 's1',
    type: 'leaf',
    decorations: ['flowers'],
    name: 'ครอบครัวสุขใจ',
    wish: 'ขอให้ทุกคนในบ้านแข็งแรง',
    createdAt: 0,
    sample: true,
  },
  {
    id: 's2',
    type: 'leaf',
    decorations: ['flowers', 'coin'],
    name: 'มิ้นท์',
    wish: 'ขอให้สอบผ่านทุกวิชา',
    createdAt: 0,
    sample: true,
  },
  {
    id: 's3',
    type: 'bread',
    decorations: ['coin'],
    name: 'ทีมกะดึก',
    wish: 'ขอให้งานราบรื่นตลอดปี',
    createdAt: 0,
    sample: true,
  },
];
