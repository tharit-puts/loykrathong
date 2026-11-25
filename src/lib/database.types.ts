/**
 * TypeScript type ของฐานข้อมูล Supabase ให้ตรงกับ supabase/schema.sql
 * (รูปแบบเดียวกับที่ `supabase gen types typescript` สร้าง ถ้าแก้ schema ให้แก้ไฟล์นี้ตาม)
 */

/** ค่าที่ CHECK constraint ในตาราง krathongs ยอมรับ */
export type DbKrathongType = 'banana_leaf' | 'ice' | 'bread' | 'invisible';
export type DbDecoration = 'flowers' | 'coin10' | 'nail';

export interface Database {
  public: {
    Tables: {
      krathongs: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          wish: string;
          krathong_type: DbKrathongType;
          decorations: DbDecoration[];
          lane: number | null;
          landing_x: number | null;
          /** เวลาที่เด็กเก็บเหรียญ 10 ไป (ตั้งโดย collect_one_coin ฝั่ง server เท่านั้น) */
          coin_collected_at: string | null;
        };
        /** anon สร้างได้เฉพาะคอลัมน์เหล่านี้ (id, created_at ฐานข้อมูลตั้งเอง) */
        Insert: {
          name: string;
          wish: string;
          krathong_type: DbKrathongType;
          decorations?: DbDecoration[];
          lane?: number | null;
          landing_x?: number | null;
        };
        /** ไม่มีสิทธิ์แก้ไข (RLS ไม่มี policy UPDATE) */
        Update: never;
        Relationships: [];
      };
      /** ผลจับเจ้าแม่คงคา (มีได้แถวเดียว) anon อ่านได้อย่างเดียว */
      lucky_draws: {
        Row: { id: string; krathong_id: string; drawn_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    /** collect_one_coin ไม่อยู่ในนี้: anon เรียกไม่ได้ (pg_cron เรียกฝั่ง server) */
    Functions: {
      get_lucky_draw_state: {
        Args: Record<string, never>;
        Returns: LuckyDrawStateJson;
      };
      krathong_decorations_valid: {
        Args: { decos: string[] };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

/** ผลของ get_lucky_draw_state() */
export interface LuckyDrawStateJson {
  server_now: string;
  hold_seconds: number;
  drawn_at: string | null;
  krathong: {
    id: string;
    name: string;
    krathong_type: DbKrathongType;
    decorations: DbDecoration[];
    coin_collected_at: string | null;
  } | null;
}

export type KrathongRow = Database['public']['Tables']['krathongs']['Row'];
export type KrathongInsert = Database['public']['Tables']['krathongs']['Insert'];
