/**
 * ทดสอบตาราง krathongs + RLS ด้วย anon key จริง (สิทธิ์เดียวกับผู้เข้าเว็บทั่วไป)
 * ใช้: npm run test:supabase   (อ่านค่าจาก .env.local และไม่พิมพ์ key ออกมา)
 *
 * ⚠️ เคสที่ "ต้องบันทึกได้" จะสร้างแถวจริงชื่อขึ้นต้นด้วย "ทดสอบ" (anon ลบเองไม่ได้)
 *    ลบทีหลังใน SQL Editor: delete from public.krathongs where name like 'ทดสอบ%';
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), 'VITE_');
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_ANON_KEY?.trim();
if (!url || !key) {
  console.error('ไม่พบ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ใน .env.local (ดู SETUP_SUPABASE.md)');
  process.exit(1);
}
// กันใส่ผิดตัว: service_role ข้าม RLS ผลทดสอบจะหลอกว่าปลอดภัยไม่ได้
const jwtRole = (() => {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  } catch {
    return null;
  }
})();
if (jwtRole === 'service_role' || key.startsWith('sb_secret_')) {
  console.error('❌ VITE_SUPABASE_ANON_KEY เป็น service_role/secret key! ห้ามใช้ฝั่งเว็บ เปลี่ยนเป็น anon/publishable key แล้ว rotate key นี้ทันที');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const COLS = 'id, created_at, name, wish, krathong_type, decorations, lane, landing_x';
let failed = 0;
const pass = (msg) => console.log(`  ✅ ${msg}`);
const fail = (msg) => {
  failed++;
  console.log(`  ❌ ${msg}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
console.log('\n1) สร้างกระทงที่ถูกต้อง (ทุกแบบ + ของตกแต่งหลายแบบ รวมไม่มีเลย)');
const valid = [
  { krathong_type: 'banana_leaf', decorations: [] },
  { krathong_type: 'ice', decorations: ['flowers'] },
  { krathong_type: 'bread', decorations: ['coin10', 'nail'] },
  { krathong_type: 'invisible', decorations: ['flowers', 'coin10', 'nail'] },
];
const created = [];
for (const [i, v] of valid.entries()) {
  const input = { name: `ทดสอบ ${i + 1}`, wish: `ขอให้ระบบทำงานดี ${i + 1}`, lane: i % 3, landing_x: 0.5, ...v };
  const { data, error } = await sb.from('krathongs').insert(input).select(COLS).single();
  if (error) {
    fail(`${v.krathong_type} ${JSON.stringify(v.decorations)} → ${error.code} ${error.message}`);
    continue;
  }
  const ok =
    data.name === input.name &&
    data.wish === input.wish &&
    data.krathong_type === input.krathong_type &&
    same(data.decorations, input.decorations) &&
    data.lane === input.lane &&
    data.landing_x === input.landing_x &&
    /^[0-9a-f-]{36}$/.test(data.id) &&
    !Number.isNaN(Date.parse(data.created_at));
  (ok ? pass : fail)(`${v.krathong_type} ${JSON.stringify(v.decorations)} → id ${data.id.slice(0, 8)}…`);
  created.push(data);
}

// ---------------------------------------------------------------------------
console.log('\n2) ข้อมูลผิดต้องถูกปฏิเสธ');
const base = { name: 'ทดสอบผิด', wish: 'ไม่ควรบันทึกได้', krathong_type: 'ice', decorations: [] };
const invalid = [
  ['name ว่าง', { name: '' }],
  ['name มีแต่ช่องว่าง', { name: '   ' }],
  ['name ยาว 21 ตัวอักษร', { name: 'ก'.repeat(21) }],
  ['wish ว่าง', { wish: '' }],
  ['wish ยาว 141 ตัวอักษร', { wish: 'ข'.repeat(141) }],
  ['krathong_type ไม่มีในลิสต์ (lotus)', { krathong_type: 'lotus' }],
  ['krathong_type เป็น null', { krathong_type: null }],
  ['decorations มีค่าที่ไม่รู้จัก (candle)', { decorations: ['flowers', 'candle'] }],
  ['decorations ซ้ำ', { decorations: ['coin10', 'coin10'] }],
  ['decorations มี null', { decorations: ['nail', null] }],
  ['lane นอกช่วง (5)', { lane: 5 }],
  ['landing_x นอกช่วง (2)', { landing_x: 2 }],
  ['ตั้ง created_at เอง', { created_at: '2000-01-01T00:00:00Z' }],
  ['ตั้ง id เอง', { id: '00000000-0000-0000-0000-000000000000' }],
];
for (const [label, patch] of invalid) {
  const { data, error } = await sb.from('krathongs').insert({ ...base, ...patch }).select('id');
  if (error) pass(`${label} → ปฏิเสธ (${error.code})`);
  else fail(`${label} → บันทึกได้! ${JSON.stringify(data)}`);
}

// ---------------------------------------------------------------------------
console.log('\n3) anon แก้ไข/ลบไม่ได้ (RLS + สิทธิ์ตาราง)');
const target = created[0];
if (!target) fail('ไม่มีแถวให้ทดสอบ (ข้อ 1 ไม่ผ่าน)');
else {
  const upd = await sb.from('krathongs').update({ wish: 'ถูกแก้!' }).eq('id', target.id).select('id');
  const del = await sb.from('krathongs').delete().eq('id', target.id).select('id');
  const delAll = await sb.from('krathongs').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
  const { data: after } = await sb.from('krathongs').select(COLS).eq('id', target.id).maybeSingle();
  const blocked = (r) => r.error || (r.data ?? []).length === 0;
  (blocked(upd) ? pass : fail)(`UPDATE → ${upd.error ? `ปฏิเสธ (${upd.error.code})` : `${upd.data?.length ?? 0} แถว`}`);
  (blocked(del) ? pass : fail)(`DELETE แถวเดียว → ${del.error ? `ปฏิเสธ (${del.error.code})` : `${del.data?.length ?? 0} แถว`}`);
  (blocked(delAll) ? pass : fail)(`DELETE ทั้งตาราง → ${delAll.error ? `ปฏิเสธ (${delAll.error.code})` : `${delAll.data?.length ?? 0} แถว`}`);
  (after && after.wish === target.wish ? pass : fail)('แถวยังอยู่และข้อมูลไม่เปลี่ยน');

  // ยิง REST ตรงๆ (ไม่ผ่าน supabase-js) ให้แน่ใจว่าไม่ใช่แค่ client กันไว้
  const rest = await fetch(`${url}/rest/v1/krathongs?id=eq.${target.id}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=representation' },
  });
  const restBody = await rest.text();
  const restBlocked = !rest.ok || restBody.trim() === '[]';
  (restBlocked ? pass : fail)(`DELETE ผ่าน REST ตรง → HTTP ${rest.status}`);
}

// ---------------------------------------------------------------------------
console.log('\n4) อ่านรายการและนับจำนวน');
const list = await sb.from('krathongs').select(COLS).order('created_at', { ascending: false }).limit(5);
(list.error ? fail : pass)(`fetch ใหม่สุด 5 ใบ → ${list.error ? list.error.message : `${list.data.length} แถว`}`);
const cnt = await sb.from('krathongs').select('id', { count: 'exact', head: true });
(cnt.error || typeof cnt.count !== 'number' ? fail : pass)(`count (head) → ${cnt.error ? cnt.error.message : cnt.count}`);

// ---------------------------------------------------------------------------
console.log('\n4b) เด็กเก็บเหรียญ: ผู้ใช้เว็บสั่งเก็บ/แก้สถานะเหรียญเองไม่ได้ (ต้องรัน migration coin_collector ก่อน)');
{
  const col = await sb.from('krathongs').select('id, coin_collected_at').limit(1);
  (col.error ? fail : pass)(`อ่านคอลัมน์ coin_collected_at ได้ → ${col.error ? `${col.error.code} ${col.error.message} (ยังไม่ได้รัน migration?)` : 'ok'}`);

  const rpc = await sb.rpc('collect_one_coin');
  (rpc.error ? pass : fail)(`anon เรียก collect_one_coin → ${rpc.error ? `ปฏิเสธ (${rpc.error.code})` : `ทำงานได้! ${JSON.stringify(rpc.data)}`}`);
  const rpcRest = await fetch(`${url}/rest/v1/rpc/collect_one_coin`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  (!rpcRest.ok ? pass : fail)(`anon เรียก collect_one_coin ผ่าน REST ตรง → HTTP ${rpcRest.status}`);

  const ins = await sb
    .from('krathongs')
    .insert({ name: 'ทดสอบผิด', wish: 'x', krathong_type: 'ice', decorations: ['coin10'], coin_collected_at: new Date().toISOString() })
    .select('id');
  (ins.error ? pass : fail)(`สร้างกระทงพร้อมตั้ง coin_collected_at เอง → ${ins.error ? `ปฏิเสธ (${ins.error.code})` : 'บันทึกได้!'}`);

  const target = created.find((r) => r.decorations.includes('coin10'));
  if (target) {
    const upd = await sb.from('krathongs').update({ coin_collected_at: new Date().toISOString() }).eq('id', target.id).select('id');
    (upd.error || !upd.data?.length ? pass : fail)(`UPDATE coin_collected_at → ${upd.error ? `ปฏิเสธ (${upd.error.code})` : `${upd.data.length} แถว`}`);
  }

  const state = await sb.from('coin_collector_state').select('*');
  (state.error || !state.data?.length ? pass : fail)(`อ่าน coin_collector_state → ${state.error ? `ปฏิเสธ (${state.error.code})` : `${state.data.length} แถว`}`);
}

// ---------------------------------------------------------------------------
console.log('\n5) key ผิดต้องได้ error (ไม่ใช่ข้อมูล)');
const bad = createClient(url, 'not-a-real-key', { auth: { persistSession: false } });
const badRes = await bad.from('krathongs').select('id').limit(1);
(badRes.error ? pass : fail)(`key ผิด → ${badRes.error ? `error ${badRes.status ?? ''} ${badRes.error.message}` : 'ได้ข้อมูล!'}`);

console.log(failed ? `\n❌ ไม่ผ่าน ${failed} ข้อ` : '\n✅ ผ่านทั้งหมด');
console.log("ลบแถวทดสอบ: SQL Editor → delete from public.krathongs where name like 'ทดสอบ%';\n");
process.exit(failed ? 1 : 0);
