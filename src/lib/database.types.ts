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
    };
    Views: { [_ in never]: never };
    Functions: {
      krathong_decorations_valid: {
        Args: { decos: string[] };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type KrathongRow = Database['public']['Tables']['krathongs']['Row'];
export type KrathongInsert = Database['public']['Tables']['krathongs']['Insert'];
