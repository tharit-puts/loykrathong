import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import bridgeRail from '../assets/bg/bridge-rail.webp';
import KrathongIcon from './KrathongIcon';
import { LAYERS, WaveLayer } from './RiverWaves';
import { LANE_WATERLINE, MAX_VISIBLE, lanePath, laneOf, pathPos, xOf } from '../lib/riverLayout';
import type { Krathong, Lane } from '../types';

interface Props {
  krathongs: Krathong[];
  latestId: string | null;
  /** จำนวนกระทงสูงสุดที่ลอยอยู่บนแม่น้ำพร้อมกัน */
  maxVisible?: number;
  /** แจ้งตำแหน่ง (px จากขอบบน <main>) ที่ฉากหลังควรจบ: ใต้ยอดคลื่นชั้นหลังพอดี */
  onSceneBottom?: (y: number) => void;
}

/** แนวน้ำอยู่ที่ 80% ของความสูงรูปกระทง (ดู KrathongIcon) */
const WATERLINE_IN_ICON = 0.8;
/** กระทงที่สร้างไม่เกินเท่านี้ก่อนแสดงผล ถือว่าเพิ่งสร้าง → เล่นอนิเมชันตกลงน้ำ */
const DROP_WINDOW_MS = 2000;
/**
 * ความสูงแถบราวสะพานไม้ล่างสุดของแม่น้ำ: 24% ของความสูงแม่น้ำ (56–120px)
 * แม่น้ำเตี้ย (จอคอมแนวนอน) แถบก็บางลง ไม่กินที่กระทง
 */
const bridgeHeight = (riverH: number) => Math.round(Math.min(120, Math.max(56, riverH * 0.24)));
/** มือถือ: แตะกระทงแล้วแสดงคำอธิษฐานนานเท่านี้ */
const TAP_SHOW_MS = 5000;

interface Box {
  /** ขนาดแม่น้ำ */
  w: number;
  h: number;
  /** ขอบบนแม่น้ำบนจอ และความสูงจอ (ใช้หาระยะตกจากกลางจอ) */
  top: number;
  vh: number;
}

type FloatStyle = CSSProperties & Record<'--start' | '--end' | '--d' | '--o', string>;

interface Layout {
  width: number;
  /** ตำแหน่งบนสุดของรูปกระทง (px จากขอบบนแม่น้ำ) */
  top: number;
  iconH: number;
  float: FloatStyle;
  /** ระยะตก (px) หรือ null ถ้าไม่ได้เพิ่งสร้าง */
  drop: number | null;
}

/**
 * คำนวณตำแหน่งกระทง
 * ตำแหน่งตามแนวนอนคิดจากเวลาที่ผ่านไปตั้งแต่สร้าง × ความเร็วคลื่นของแถวนั้น
 * แล้วแปลงเป็น animation-delay ติดลบ ให้ animation เริ่มตรงตำแหน่งที่ควรอยู่ ณ ตอน mount
 */
function layout(k: Krathong, lane: Lane, box: Box, mountedAt: number): Layout {
  const { width, start, end, travel, speed } = lanePath(box.w, lane);
  const iconH = (width * 100) / 120;
  // แถวหน้าสุดต้องลอยเหนือราวสะพานด้านล่าง (เว้นไว้ 16px) ไม่ให้จมหายไปหลังสะพาน
  const laneY = Math.min(box.h * LANE_WATERLINE[lane], box.h - bridgeHeight(box.h) - 16);
  // ตำแหน่งบนเส้นทาง ณ ตอน mount (สูตรเดียวกับที่ใช้เลือกจุดตกไม่ให้ซ้อนกัน)
  const dist = pathPos(xOf(k), k.createdAt, lane, box.w, mountedAt);

  const isFresh = mountedAt - k.createdAt < DROP_WINDOW_MS;
  // ตกจากกลางจอลงมาถึงแนวน้ำ (อย่างน้อย 120px เผื่อแถวที่อยู่สูงกว่ากลางจอ)
  const drop = isFresh ? Math.max(120, box.top + laneY - box.vh / 2) : null;

  return {
    width,
    top: laneY - iconH * WATERLINE_IN_ICON,
    iconH,
    float: {
      '--start': `${start}px`,
      '--end': `${end}px`,
      '--d': `${(travel / speed).toFixed(2)}s`,
      '--o': `${(-dist / speed).toFixed(2)}s`,
    },
    drop,
  };
}

export default function River({ krathongs, latestId, maxVisible = MAX_VISIBLE, onSceneBottom }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onSceneBottomRef = useRef(onSceneBottom);
  onSceneBottomRef.current = onSceneBottom;
  const [box, setBox] = useState<Box | null>(null);
  /**
   * เวลาที่กระทงแต่ละใบ mount (key รวมขนาดแม่น้ำ → ย่อ/ขยายจอแล้ว mount ใหม่ คำนวณตำแหน่งใหม่)
   * ต้องจำไว้ เพราะ animation-delay ต้องคิดจากเวลา mount ครั้งแรกเสมอ ไม่งั้น re-render แล้วกระทงจะกระโดด
   */
  const mounted = useRef(new Map<string, number>());

  /** กระทงที่กำลังแสดงคำอธิษฐาน (เมาส์ชี้ / แตะบนมือถือ / โฟกัสด้วยคีย์บอร์ด) */
  const [active, setActive] = useState<string | null>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(tapTimer.current), []);

  /** แสดงคำอธิษฐาน ถ้าใส่ ms จะซ่อนเองเมื่อครบเวลา */
  const showWish = (id: string, ms?: number) => {
    window.clearTimeout(tapTimer.current);
    setActive(id);
    if (ms) tapTimer.current = window.setTimeout(() => setActive((cur) => (cur === id ? null : cur)), ms);
  };
  const hideWish = (id: string) => setActive((cur) => (cur === id ? null : cur));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.round(r.width), h: Math.round(r.height), top: r.top, vh: window.innerHeight });
      // ขอบล่างของฉากหลัง = ร่องคลื่นชั้นหลังสุด (ยอดคลื่น + ความสูงคลื่น) ภาพจึงต่อกับน้ำพอดี ไม่มีช่องโหว่ระหว่างยอดคลื่น
      // offsetTop ของ section วัดจาก <main> (offsetParent) บวกระยะที่ตัวแม่น้ำถูกดันลงในมือถือ
      const section = el.parentElement!;
      onSceneBottomRef.current?.(section.offsetTop + el.offsetTop + LAYERS[0].height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = krathongs.slice(-maxVisible);
  const now = Date.now();
  const items = box
    ? visible.map((k) => {
        const lane = laneOf(k);
        const key = `${k.id}@${box.w}x${box.h}`;
        if (!mounted.current.has(key)) mounted.current.set(key, now);
        return { k, lane, key, isNew: k.id === latestId, l: layout(k, lane, box, mounted.current.get(key)!) };
      })
    : [];

  return (
    <section
      // overflow-x-clip: ตัดคลื่นที่ยื่นเกินจอซ้ายขวา แต่ให้กระทงแถวบนโผล่พ้นขอบบนแม่น้ำได้
      // มือถือแนวตั้ง: สูง 43% ของจอ (หดได้ถ้า Hero ยาวกว่าที่เหลือ) ให้ Hero กินพื้นที่ที่เหลือ → จำนวนกระทง/ปุ่มไปอยู่เหนือแม่น้ำ
      className="relative -mt-[clamp(32px,5vw,72px)] min-h-0 flex-1 overflow-x-clip mobile-portrait:flex-[0_1_43dvh]"
      aria-label="สายน้ำที่มีกระทงลอยอยู่"
    >
      {/* ตัวแม่น้ำ: มือถือสูงไม่เกิน 43% ของจอ ชิดล่าง ให้เห็นฉากเมืองมากขึ้น (จอเตี้ยก็ใช้เต็มพื้นที่เหมือนเดิม) */}
      <div ref={ref} className="absolute inset-x-0 bottom-0 h-full max-md:h-[min(100%,43dvh)]">
        {/* คลื่นแต่ละชั้น ตามด้วยกระทงของแถวนั้น: คลื่นชั้นหน้าจะบังกระทงแถวหลัง */}
        {LAYERS.map((layer, lane) => (
          <Fragment key={lane}>
            <WaveLayer layer={layer} />

            {/* แสงจันทร์สะท้อนน้ำ: อยู่บนคลื่นทุกชั้น ใต้กระทงแถวหน้า */}
            {lane === LAYERS.length - 1 && (
              <div className="absolute top-0 left-1/2 h-full w-[120px] -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgba(255,231,160,0.35)_40px,transparent_70%)] blur-[10px]" />
            )}

            {items
              .filter((it) => it.lane === lane)
              .map(({ k, key, l }) => (
                // คอม: เมาส์ชี้แล้วแสดงคำอธิษฐาน / มือถือ: แตะแล้วแสดง 5 วินาที / คีย์บอร์ด: Tab มาโฟกัสแล้วแสดง
                <button
                  key={key}
                  type="button"
                  aria-label={`กระทงของ ${k.name}`}
                  aria-describedby={`wish-${k.id}`}
                  className="absolute left-0 animate-drift cursor-pointer border-0 bg-transparent p-0"
                  style={{ ...l.float, top: l.top, width: l.width }}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && showWish(k.id)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && hideWish(k.id)}
                  onPointerUp={(e) => e.pointerType !== 'mouse' && showWish(k.id, TAP_SHOW_MS)}
                  onFocus={(e) => e.currentTarget.matches(':focus-visible') && showWish(k.id)}
                  onBlur={() => hideWish(k.id)}
                >
                  <div
                    className={l.drop !== null ? 'origin-bottom animate-drop' : undefined}
                    style={l.drop !== null ? ({ '--drop': `${l.drop}px` } as CSSProperties) : undefined}
                  >
                    <KrathongIcon
                      type={k.type}
                      decorations={k.decorations}
                      className="block h-auto w-full animate-bob drop-shadow-[0_6px_6px_rgba(0,0,0,0.35)]"
                    />
                  </div>
                </button>
              ))}
          </Fragment>
        ))}

        {/*
         * ราวสะพานไม้ล่างสุด (ครึ่งบนของภาพสะพาน: ราว + เสา + กระดาน) อยู่หน้าคลื่นและกระทง แต่ใต้ป้ายชื่อ/บับเบิล
         * ภาพตัดจากกึ่งกลางเสาต้นแรกถึงต้นสุดท้าย เรียงซ้ำแนวนอนแล้วครึ่งเสาต่อกันเป็นเสาเต็มพอดี
         */}
        {box && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-[length:auto_100%] bg-[position:center_top] bg-repeat-x drop-shadow-[0_-4px_8px_rgba(5,30,60,0.35)]"
            style={{ height: bridgeHeight(box.h), backgroundImage: `url(${bridgeRail})` }}
          />
        )}

        {/* ป้ายชื่ออยู่ชั้นบนสุดเสมอ ไม่ให้คลื่นบัง — ใช้ค่า animation ชุดเดียวกับกระทง จึงเคลื่อนไปพร้อมกัน */}
        {items.map(({ k, key, isNew, l }) => (
          <div
            key={key}
            className="pointer-events-none absolute left-0 flex animate-drift justify-center"
            style={{ ...l.float, top: l.top + l.iconH - 4, width: l.width }}
          >
            <span
              className={`inline-block max-w-[150px] shrink-0 overflow-hidden rounded-[10px] px-2.5 py-0.5 text-[13px] text-ellipsis whitespace-nowrap ${
                isNew ? 'bg-pink2' : 'bg-[rgba(6,18,45,0.75)]'
              } ${l.drop !== null ? 'origin-top animate-drop' : ''}`}
              style={l.drop !== null ? ({ '--drop': `${l.drop}px` } as CSSProperties) : undefined}
            >
              {k.name}
            </span>
          </div>
        ))}

        {/*
         * บับเบิลคำอธิษฐาน: วาดไว้ล่วงหน้าทุกใบ (ซ่อนอยู่) ด้วยค่า animation ชุดเดียวกับกระทง
         * จึงอยู่ตรงหัวกระทงพอดีเสมอ แค่สลับให้แสดง/ซ่อน
         */}
        {items.map(({ k, key, l }) => {
          const on = active === k.id;
          return (
            <div
              key={key}
              className="pointer-events-none absolute left-0 animate-drift"
              style={{ ...l.float, top: l.top, width: l.width }}
            >
              <div
                id={`wish-${k.id}`}
                role="tooltip"
                className={`absolute bottom-full left-1/2 mb-1.5 w-max max-w-[min(240px,80vw)] origin-bottom -translate-x-1/2 rounded-2xl bg-white px-3.5 py-2 text-[14px] leading-snug text-[#1d2440] shadow-[0_6px_18px_rgba(0,0,0,0.3)] transition-[opacity,scale] duration-200 ${
                  on ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
                }`}
              >
                {k.wish}
                {/* หางบับเบิลชี้ลงที่กระทง */}
                <span
                  aria-hidden="true"
                  className="absolute top-full left-1/2 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-white"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
