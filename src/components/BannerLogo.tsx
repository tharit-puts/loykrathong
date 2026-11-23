import flowers from '../assets/krathong/deco-flowers.webp';

interface Props {
  text?: string;
  className?: string;
}

/** ป้ายโลโก้สีทอง (overflow-visible: ช่อดอกไม้ยื่นพ้นขอบบนของ viewBox) */
export default function BannerLogo({ text = 'ลอยกระทงร่วมกัน', className = '' }: Props) {
  return (
    <svg className={`overflow-visible ${className}`} viewBox="0 0 560 150" role="img" aria-label={text}>
      <defs>
        <linearGradient id="banner-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset=".5" stopColor="#f4b83a" />
          <stop offset="1" stopColor="#c9811b" />
        </linearGradient>
      </defs>
      <path d="M20 58 L70 58 L60 82 L70 106 L20 106 L36 82Z" fill="#c9811b" />
      <path d="M540 58 L490 58 L500 82 L490 106 L540 106 L524 82Z" fill="#c9811b" />
      <path d="M60 40 Q280 14 500 40 L500 112 Q280 86 60 112Z" fill="url(#banner-gold)" stroke="#fff1bf" strokeWidth="2" />
      <path
        d="M72 50 Q280 26 488 50 L488 102 Q280 78 72 102Z"
        fill="none"
        stroke="#9a5c10"
        strokeWidth="1.5"
        strokeDasharray="2 5"
      />
      {/* ช่อดอกไม้รวม (ภาพเดียวกับของตกแต่งบนกระทง) วางเกยขอบบนป้ายตรงกลาง */}
      <image href={flowers} x="242" y="-22" width="76" height="60" />
      <text
        x="280"
        y="84"
        textAnchor="middle"
        fontFamily="Mitr, sans-serif"
        fontWeight="600"
        fontSize="44"
        fill="#5a2a00"
      >
        {text}
      </text>
    </svg>
  );
}
