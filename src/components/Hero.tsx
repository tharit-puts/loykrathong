import BannerLogo from './BannerLogo';
import KrathongIcon from './KrathongIcon';
import { cta } from './ui';

interface Props {
  count: number;
  onCreate: () => void;
}

/*
 * มือถือแนวตั้ง: Hero กินพื้นที่ที่เหลือเหนือแม่น้ำ (River สูง 43dvh) แล้วดันกลุ่ม "จำนวนกระทง + ปุ่มสร้างกระทง"
 * ลงไปชิดล่าง (mt-auto) ให้อยู่เหนือแม่น้ำ ส่วนโลโก้อยู่บนสุด
 * โลโก้มือถือใหญ่ขึ้น 20% (120% ของความกว้างเนื้อหา) แต่ไม่เกิน 107.7vw = ปลายริบบิ้นพอดีขอบจอ
 * (SVG มีที่ว่างซ้ายขวาข้างละ 20/560 จึงกว้างเกินจอได้นิดหนึ่งโดยตัวป้ายไม่ล้น)
 */
export default function Hero({ count, onCreate }: Props) {
  return (
    <section
      className="relative text-center mobile-portrait:flex mobile-portrait:flex-[1_0_auto] mobile-portrait:flex-col"
      id="top"
    >
      <div className="relative mx-auto max-w-[820px] px-[max(5vw,16px)] pt-[clamp(28px,5vw,60px)] pb-[clamp(88px,10vw,130px)] mobile-portrait:flex mobile-portrait:w-full mobile-portrait:flex-1 mobile-portrait:flex-col [@media(max-height:620px)]:pt-3 [@media(max-height:620px)]:pb-14">
        {/* โลโก้เป็นหัวเรื่องหลักของหน้า (อ่านจาก aria-label ของ SVG) */}
        <h1 className="mb-4 [@media(max-height:620px)]:mb-2">
          <BannerLogo className="mx-auto block h-auto w-[min(560px,100%)] drop-shadow-[0_8px_24px_rgba(244,184,58,0.35)] mobile-portrait:relative mobile-portrait:left-1/2 mobile-portrait:mx-0 mobile-portrait:w-[min(672px,120%,107.7vw)] mobile-portrait:max-w-none mobile-portrait:-translate-x-1/2 [@media(max-height:620px)]:w-[min(300px,100%)] mobile-portrait:[@media(max-height:620px)]:w-[min(360px,120%,107.7vw)]" />
        </h1>

        {/* จำนวนกระทง + ปุ่มสร้างกระทง (มือถือแนวตั้ง: ชิดล่างของ Hero เหนือแม่น้ำ) */}
        <div className="mobile-portrait:mt-auto">
          <div
            className="mb-[10px] [@media(max-height:620px)]:mb-2.5 inline-flex items-center gap-2 rounded-full border-2 border-gold bg-[rgba(20,25,60,0.88)] py-1.5 pr-6 pl-3 shadow-[0_6px_20px_rgba(0,0,0,0.4),0_0_14px_rgba(232,184,74,0.35)] backdrop-blur-md"
            aria-live="polite"
          >
            <KrathongIcon type="leaf" decorations={["flowers"]} className="h-[45px] w-[54px]" />
            {/* บรรทัดเดียว: ทั้งหมด X ใบ */}
            <p className="flex items-center gap-2 font-head text-[18px] leading-none whitespace-nowrap text-[#fff7e0]">
              ทั้งหมด
              <b className="flex items-center text-[clamp(26px,4vw,32px)] font-semibold text-gold2 [text-shadow:0_0_10px_rgba(255,214,102,0.8),0_2px_0_rgba(0,0,0,0.3)]">
                {count.toLocaleString('th-TH')}
              </b>
              ใบ
            </p>
          </div>

          {/*
           * mb มือถือ = ระยะเผื่อใต้ปุ่ม: ยิ่งมาก ปุ่ม (และกล่องจำนวน) ยิ่งลอยสูงจากแม่น้ำ
           * สูงสุด 53px, จอเตี้ยลดลงจนเหลือ 0 ที่ความสูงจอ ≤700px (ไม่งั้นแม่น้ำจะถูกบีบให้เตี้ยลง)
           */}
          <div className="mobile-portrait:mb-[clamp(0px,calc(100dvh-700px),73px)]">
            <button className={cta} type="button" onClick={onCreate}>
              สร้างกระทง
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
