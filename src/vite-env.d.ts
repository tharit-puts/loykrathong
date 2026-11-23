/// <reference types="vite/client" />

/** ตัวแปรจาก .env.local (ขึ้นต้นด้วย VITE_ จึงถูกส่งไปฝั่ง browser: ใส่ได้เฉพาะค่าที่เปิดเผยได้) */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
