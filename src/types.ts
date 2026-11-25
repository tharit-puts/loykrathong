export type KrathongType = 'leaf' | 'ice' | 'bread' | 'invisible';

/** ของตกแต่งที่เลือกเพิ่มได้ (ธูปเทียนมีบนกระทงทุกใบอยู่แล้ว ไม่ต้องเก็บ) */
export type Decoration = 'flowers' | 'coin' | 'nail';

/** แถวบนแม่น้ำ: 0 = บน (คลื่นชั้นหลัง), 1 = กลาง, 2 = ล่าง (คลื่นชั้นหน้า) */
export type Lane = 0 | 1 | 2;

/** ข้อมูลจากฟอร์มสร้างกระทง */
export interface NewKrathong {
  type: KrathongType;
  decorations: Decoration[];
  name: string;
  wish: string;
}

export interface Krathong extends NewKrathong {
  id: string;
  createdAt: number;
  /** แถวที่สุ่มได้ตอนสร้าง (กระทงเก่าที่ไม่มีค่านี้จะคำนวณจาก id แทน) */
  lane?: Lane;
  /** ตำแหน่งแนวนอนตอนตกลงน้ำ เป็นสัดส่วนความกว้างแม่น้ำ (0–1) */
  x?: number;
  /** เด็กเก็บเหรียญ 10 ไปแล้ว (coin_collected_at มีค่า) → ไม่แสดงเหรียญ แต่ decorations ยังมี coin เพื่อทำสถิติ */
  coinCollected?: boolean;
}

/** ของตกแต่งที่แสดงบนกระทง: ถ้าเหรียญถูกเก็บไปแล้วก็ไม่แสดงเหรียญ (holdCoin = ยังแสดงไว้ระหว่างรอเด็กก้มหยิบ) */
export function shownDecorations(k: Pick<Krathong, 'decorations' | 'coinCollected'>, holdCoin = false): Decoration[] {
  return k.coinCollected && !holdCoin ? k.decorations.filter((d) => d !== 'coin') : k.decorations;
}

export const KRATHONG_LABELS: Record<KrathongType, string> = {
  leaf: 'ใบตอง',
  ice: 'น้ำแข็ง',
  bread: 'ขนมปัง',
  invisible: 'ล่องหน',
};

export type ModalName = 'create' | 'wishes' | null;

export const NAME_MAX = 20;
export const WISH_MAX = 140;
