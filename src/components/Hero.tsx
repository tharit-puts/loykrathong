import BannerLogo from './BannerLogo';
import KrathongIcon from './KrathongIcon';
import { cta } from './ui';

interface Props {
  count: number;
  onCreate: () => void;
}

export default function Hero({ count, onCreate }: Props) {
  return (
    <section
      className="relative text-center"
      id="top"
    >
      <div className="relative mx-auto max-w-[820px] px-[max(5vw,16px)] pt-[clamp(28px,5vw,60px)] pb-[clamp(88px,10vw,130px)] [@media(max-height:620px)]:pt-3 [@media(max-height:620px)]:pb-14">
        {/* โลโก้เป็นหัวเรื่องหลักของหน้า (อ่านจาก aria-label ของ SVG) */}
        <h1 className="mb-5 [@media(max-height:620px)]:mb-2">
          <BannerLogo className="mx-auto block h-auto w-[min(560px,100%)] [@media(max-height:620px)]:w-[min(300px,100%)] drop-shadow-[0_8px_24px_rgba(244,184,58,0.35)]" />
        </h1>

        <div
          className="mb-[22px] [@media(max-height:620px)]:mb-2.5 inline-flex items-center gap-3 rounded-full border-2 border-gold bg-[rgba(20,25,60,0.88)] py-1.5 pr-6 pl-3 shadow-[0_6px_20px_rgba(0,0,0,0.4),0_0_14px_rgba(232,184,74,0.35)] backdrop-blur-md"
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

        <div>
          <button className={cta} type="button" onClick={onCreate}>
            สร้างกระทง
          </button>
        </div>
      </div>
    </section>
  );
}
