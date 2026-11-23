/**
 * ที่มา: กรุงเทพมหานคร โดยสำนักสิ่งแวดล้อม แถลงเมื่อ 6 พ.ย. 2568
 * ปี 2566–2567 รายงานเฉพาะสัดส่วนวัสดุธรรมชาติ
 */
export interface YearStat {
  year: number;
  total: number;
  naturalPercent: number;
}

export interface MaterialStat {
  label: string;
  count: number;
  percent: number;
  color: string;
}

export const YEAR_STATS: YearStat[] = [
  { year: 2566, total: 639828, naturalPercent: 96.74 },
  { year: 2567, total: 514590, naturalPercent: 98.39 },
  { year: 2568, total: 391027, naturalPercent: 82.76 },
];

export const MATERIALS_2568: MaterialStat[] = [
  { label: 'วัสดุธรรมชาติ', count: 323626, percent: 82.76, color: '#4fc08d' },
  { label: 'ขนมปัง', count: 39103, percent: 10.01, color: '#f4b83a' },
  { label: 'โฟม', count: 28298, percent: 7.23, color: '#ff5e8e' },
];

export const ONLINE_2568 = 23347;

export const STATS_SOURCE =
  'ที่มา: กรุงเทพมหานคร โดยสำนักสิ่งแวดล้อม แถลงเมื่อ 6 พ.ย. 2568 (ปี 2566–2567 รายงานเฉพาะสัดส่วนวัสดุธรรมชาติ)';
