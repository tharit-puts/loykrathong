interface Props {
  onOpenWishes: () => void;
}

export default function Navbar({ onOpenWishes }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-end border-b border-[rgba(244,184,58,0.25)] bg-[rgba(8,16,40,0.82)] px-[max(4vw,14px)] backdrop-blur-[8px] max-[600px]:justify-center">
      <button
        className="min-h-11 border-0 bg-transparent px-1.5 py-2.5 text-[15px] text-ink hover:text-gold2"
        type="button"
        onClick={onOpenWishes}
      >
        ดูคำอธิษฐานทั้งหมด
      </button>
    </header>
  );
}
