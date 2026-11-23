import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Supabase client ตัวเดียวของทั้งเว็บ
 *
 * ใช้เฉพาะ anon (public) key เท่านั้น: key นี้เห็นได้ใน browser อยู่แล้ว ความปลอดภัยมาจาก RLS ใน supabase/schema.sql
 * ห้ามใส่ service_role key ในโค้ดหรือ .env ฝั่งเว็บเด็ดขาด (ข้าม RLS ทั้งหมด ใครได้ไปลบข้อมูลทั้งตารางได้)
 *
 * สร้างตอนเรียกใช้ครั้งแรก (ไม่ใช่ตอน import) ถ้ายังไม่ได้ตั้ง env หน้าเว็บจะยังเปิดได้
 * แค่ส่วนที่ต่อฐานข้อมูลจะแสดงข้อความ error แทน
 */

export class SupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `ยังไม่ได้ตั้งค่า Supabase: ไม่พบ ${missing.join(', ')}\n` +
        'ให้คัดลอก .env.example เป็น .env.local แล้วใส่ Project URL และ anon key จาก ' +
        'Supabase Dashboard > Project Settings > API จากนั้นรีสตาร์ท dev server (ดู SETUP_SUPABASE.md)',
    );
    this.name = 'SupabaseConfigError';
  }
}

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const missing = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean) as string[];
  if (missing.length) throw new SupabaseConfigError(missing);

  client = createClient<Database>(url!, anonKey!, {
    // เว็บนี้ไม่มีระบบล็อกอิน: ไม่ต้องเก็บ session
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
