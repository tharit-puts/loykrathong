import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** หน้าต่างป๊อปอัปจาก <dialog> (กด Esc หรือคลิกพื้นหลังเพื่อปิด) */
export default function Modal({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="m-auto max-h-[calc(100vh_-_32px)] w-[min(560px,calc(100vw_-_24px))] rounded-[22px] border border-[rgba(244,184,58,0.45)] bg-[#0f1d46] p-0 text-ink backdrop:bg-[rgba(3,8,24,0.75)]"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-5 pt-[18px]">
        <h2 id={titleId} className="text-[24px] text-gold2">
          {title}
        </h2>
        <button
          type="button"
          className="h-11 w-11 rounded-full border border-line bg-transparent text-[22px] text-ink"
          onClick={onClose}
          aria-label="ปิด"
        >
          ×
        </button>
      </div>
      <div className="px-5 pt-4 pb-[22px]">{children}</div>
    </dialog>
  );
}
