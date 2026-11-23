import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import KrathongIcon, { DecorationArt } from './KrathongIcon';
import KrathongPreview from './KrathongPreview';
import { DECORATION_OPTIONS, KRATHONG_OPTIONS } from '../data/krathongOptions';
import { SAMPLE_WISHES, TERMS } from '../data/wishes';
import { NAME_MAX, WISH_MAX, type Decoration, type KrathongType, type NewKrathong } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** บันทึกกระทง: ล้มเหลวให้ throw Error ที่มีข้อความสำหรับผู้ใช้ (ฟอร์มจะแสดงข้อความและไม่ปิด) */
  onSubmit: (data: NewKrathong) => Promise<void>;
}

type Step = 1 | 2 | 3;
const STEPS = ['เลือกกระทง', 'ตกแต่งกระทง', 'พิมพ์คำอธิษฐาน'];

/** สุ่มคำอธิษฐาน ไม่ให้ซ้ำกับข้อความเดิม */
function pickWish(current: string) {
  const pool = SAMPLE_WISHES.filter((w) => w !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- ชิ้นส่วน UI ---------- */

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <ol className="relative grid grid-cols-3 rounded-full bg-white/35 py-1.5">
        {/* เส้นเชื่อมระหว่างวงกลม: จากกลางช่องแรกถึงกลางช่องสุดท้าย */}
        <span className="absolute inset-x-[16.67%] top-1/2 h-0.5 -translate-y-1/2 bg-[#d17ccb]" aria-hidden="true" />
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} className="relative grid place-items-center" aria-current={current ? 'step' : undefined}>
              <span
                className={`grid size-9 place-items-center rounded-full font-head text-[18px] ${
                  done || current
                    ? 'bg-[linear-gradient(180deg,#c33bb5,#86167f)] text-white ring-2 ring-white'
                    : 'bg-white text-[#2b2b3a] ring-2 ring-[#d17ccb]'
                }`}
              >
                {done ? <CheckIcon className="size-5" /> : n}
              </span>
              <span className="sr-only">
                {label}
                {done ? ' (เสร็จแล้ว)' : current ? ' (ขั้นตอนปัจจุบัน)' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-1 grid grid-cols-3 text-center text-[11.5px] text-white/90" aria-hidden="true">
        {STEPS.map((label, i) => (
          <span key={label} className={i + 1 === step ? 'font-semibold text-white' : ''}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  kind: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
  label: string;
  note?: string;
  art: ReactNode;
}

/** การ์ดตัวเลือก: วงกลมรูป + ชื่อ + คำอธิบาย (input ซ่อนไว้ ใช้คีย์บอร์ด/โปรแกรมอ่านหน้าจอได้ปกติ) */
function OptionCard({ kind, name, checked, disabled, onChange, label, note, art }: CardProps) {
  return (
    <label
      className={`flex w-[116px] shrink-0 snap-center flex-col items-center text-center md:w-auto ${
        disabled ? 'cursor-default' : 'cursor-pointer'
      }`}
    >
      <input
        type={kind}
        name={name}
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className={`relative grid size-24 place-items-center rounded-full transition-shadow peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-gold2 ${
          checked
            ? 'bg-[radial-gradient(circle_at_50%_70%,#ffc56b,#e0702a_60%,#b2441c)] ring-4 ring-white'
            : 'bg-[rgba(205,238,247,0.6)] hover:ring-2 hover:ring-white/70'
        }`}
      >
        <span className="grid size-full place-items-center overflow-hidden rounded-full">{art}</span>
        {checked && (
          <span className="absolute -top-0.5 -right-0.5 grid size-7 place-items-center rounded-full bg-[#86167f] text-white ring-2 ring-white">
            <CheckIcon className="size-4" />
          </span>
        )}
      </span>
      <span className="mt-2 font-head text-[15px] leading-tight text-white">{label}</span>
      {note && <span className="mt-0.5 text-[12.5px] leading-snug text-[#ffe48c]">{note}</span>}
    </label>
  );
}

const primaryBtn =
  'min-h-12 rounded-full bg-[linear-gradient(180deg,#d443b3,#8a1379)] px-10 font-head text-[20px] text-white shadow-[0_4px_0_#5c0b50] ring-2 ring-white/70 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none ' +
  'disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#6a8fb8] disabled:text-white/60 disabled:shadow-none disabled:ring-white/30 disabled:hover:translate-y-0';
const backBtn =
  'inline-flex min-h-12 items-center gap-1 rounded-full border-2 border-white/85 bg-[#0d3f5c] px-5 font-head text-[18px] text-white hover:bg-[#12506f]';

function StepHeading({ title, subtitle, headingRef }: { title: string; subtitle: string; headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <div className="text-center">
      <h2 ref={headingRef} tabIndex={-1} className="font-head text-[24px] text-white outline-none">
        {title}
      </h2>
      <p className="mt-0.5 text-[13px] text-white/85">{subtitle}</p>
    </div>
  );
}

/* ---------- ตัวหลัก ---------- */

/** หน้าต่างสร้างกระทง 3 ขั้นตอน: เลือกกระทง → ตกแต่ง → ชื่อและคำอธิษฐาน */
export default function CreateKrathongWizard({ open, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const nameHelpId = useId();

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<KrathongType>('leaf');
  const [decorations, setDecorations] = useState<Decoration[]>([]);
  const [name, setName] = useState('');
  const [wish, setWish] = useState('');
  /** ผู้ใช้แก้คำอธิษฐานเองแล้ว → ไม่สุ่มทับอีก */
  const [wishEdited, setWishEdited] = useState(false);
  /** กำลังบันทึกลงฐานข้อมูล / ข้อความเมื่อบันทึกไม่สำเร็จ */
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // เปิด/ปิด <dialog> และล้างค่าใหม่ทุกครั้งที่เปิด
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setStep(1);
      setType('leaf');
      setDecorations([]);
      setName('');
      setWish('');
      setWishEdited(false);
      setSubmitting(false);
      setSubmitError(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // เปลี่ยนขั้นตอนแล้วย้ายโฟกัสไปที่หัวข้อ ให้โปรแกรมอ่านหน้าจออ่านขั้นตอนใหม่
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (open) headingRef.current?.focus();
  }, [step, open]);

  const goTo = (next: Step) => {
    // เข้า step 3: สุ่มคำอธิษฐานใหม่ทุกครั้ง ถ้าผู้ใช้ยังไม่ได้แก้เอง
    if (next === 3 && !wishEdited) setWish((w) => pickWish(w));
    setStep(next);
  };

  const toggleDecoration = (d: Decoration) =>
    setDecorations((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const n = name.trim();
  const w = wish.trim();
  const canSubmit = n.length > 0 && w.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({ type, decorations, name: n, wish: w });
    } catch (err) {
      // ไม่ปิดหน้าต่าง: ชื่อและคำอธิษฐานที่พิมพ์ไว้ยังอยู่ กดลองใหม่ได้เลย
      setSubmitError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase = 'w-full bg-[rgba(8,52,88,0.55)] text-[16px] text-white placeholder:text-white/65';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100vw_-_20px)] max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-[rgba(3,8,24,0.75)] md:w-[min(960px,calc(100vw_-_56px))]"
    >
      <h1 id={titleId} className="sr-only">
        สร้างกระทง
      </h1>

      {/* ปุ่มปิด มุมขวาบน */}
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute -top-3 -right-2 z-20 grid size-11 place-items-center rounded-full bg-[linear-gradient(180deg,#d443b3,#8a1379)] text-white shadow-lg ring-2 ring-white md:-top-4 md:-right-4"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex max-h-[calc(100dvh_-_20px)] flex-col overflow-y-auto rounded-[18px] bg-[linear-gradient(165deg,#2aa9bd_0%,#2189b4_55%,#1d6aa5_100%)] md:grid md:max-h-[calc(100dvh_-_56px)] md:min-h-[540px] md:grid-cols-[300px_1fr] md:overflow-hidden">
        {/* stepper (มือถือ): อยู่บนสุดเหนือภาพตัวอย่าง */}
        <div className="px-4 pt-4 pb-3 md:hidden">
          <Stepper step={step} />
        </div>

        <KrathongPreview
          type={type}
          decorations={decorations}
          className="h-[210px] shrink-0 md:h-auto md:rounded-l-[18px]"
        />

        <div className="flex min-w-0 flex-col md:overflow-y-auto">
          {/* stepper (เดสก์ท็อป) */}
          <div className="hidden border-b border-white/35 px-6 pt-5 pb-3 md:block">
            <Stepper step={step} />
          </div>

          <div className="flex flex-1 flex-col gap-5 px-4 pt-5 pb-6 md:px-8">
            {step === 1 && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="เลือกกระทงที่คุณชอบ"
                  subtitle="เลือกได้ 1 แบบ แต่ละแบบย่อยสลายเร็วช้าต่างกัน"
                />
                <fieldset className="min-w-0">
                  <legend className="sr-only">แบบกระทง</legend>
                  <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pt-1 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
                    {KRATHONG_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.id}
                        kind="radio"
                        name="krathong-type"
                        checked={type === o.id}
                        onChange={() => setType(o.id)}
                        label={o.label}
                        note={o.note}
                        art={<KrathongIcon type={o.id} className="mt-2 w-[82%]" />}
                      />
                    ))}
                  </div>
                </fieldset>
                <div className="mt-auto flex justify-center">
                  <button type="button" className={primaryBtn} onClick={() => goTo(2)}>
                    ตกลง
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <StepHeading
                  headingRef={headingRef}
                  title="ตกแต่งกระทง"
                  subtitle="เลือกของใส่กระทงได้มากกว่า 1 อย่าง"
                />
                <fieldset className="min-w-0">
                  <legend className="sr-only">ของตกแต่ง</legend>
                  <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pt-1 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
                    {/* ธูปเทียน: มีบนกระทงทุกใบ ติ๊กไว้ตลอด กดเอาออกไม่ได้ */}
                    <OptionCard
                      kind="checkbox"
                      name="decoration"
                      checked
                      disabled
                      label="ธูปเทียน"
                      art={<DecorationArt item="top" className="w-[36%]" />}
                    />
                    {DECORATION_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.id}
                        kind="checkbox"
                        name="decoration"
                        checked={decorations.includes(o.id)}
                        onChange={() => toggleDecoration(o.id)}
                        label={o.label}
                        note={o.note}
                        art={<DecorationArt item={o.id} className="w-[76%]" />}
                      />
                    ))}
                  </div>
                </fieldset>
                <div className="mt-auto flex justify-center gap-3">
                  <button type="button" className={backBtn} onClick={() => goTo(1)}>
                    <span aria-hidden="true">‹</span> กลับไป
                  </button>
                  <button type="button" className={primaryBtn} onClick={() => goTo(3)}>
                    ตกลง
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col gap-5">
                <StepHeading headingRef={headingRef} title="ใส่ชื่อและคำอธิษฐาน" subtitle="กรอกข้อมูลให้ครบถ้วน" />

                <div className="grid gap-x-5 gap-y-1.5 md:grid-cols-[110px_1fr] md:items-start">
                  <label htmlFor="wiz-name" className="font-head text-[17px] md:pt-2.5 md:text-right">
                    ชื่อของคุณ
                  </label>
                  <div>
                    <input
                      id="wiz-name"
                      className={`${inputBase} h-12 rounded-full border-2 border-[#f06bc4] px-5`}
                      value={name}
                      maxLength={NAME_MAX}
                      autoComplete="nickname"
                      placeholder="กรอกชื่อของคุณ"
                      aria-describedby={nameHelpId}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <div className="mt-1 flex justify-between gap-3 px-2 text-[12px] text-white/85">
                      <span id={nameHelpId}>
                        * ใช้ชื่อเล่นหรือนามแฝงได้ (ไม่ต้องใส่นามสกุล) ทุกคนที่เข้าเว็บจะเห็นชื่อและคำอธิษฐานนี้
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {name.length}/{NAME_MAX}
                      </span>
                    </div>
                  </div>

                  <label htmlFor="wiz-wish" className="mt-3 font-head text-[17px] md:mt-0 md:pt-2.5 md:text-right">
                    คำอธิษฐาน
                  </label>
                  <div>
                    <textarea
                      id="wiz-wish"
                      className={`${inputBase} min-h-24 resize-y rounded-2xl border-2 border-white px-4 py-3 leading-normal`}
                      value={wish}
                      maxLength={WISH_MAX}
                      onChange={(e) => {
                        setWish(e.target.value);
                        setWishEdited(true);
                      }}
                    />
                    <div className="mt-1 px-2 text-right text-[12px] text-white/85 tabular-nums">
                      {wish.length}/{WISH_MAX}
                    </div>
                  </div>
                </div>

                <details className="group mx-auto w-full max-w-[460px] text-[13.5px]">
                  <summary className="flex cursor-pointer list-none items-center justify-center gap-1 text-white [&::-webkit-details-marker]:hidden">
                    * เงื่อนไข การร่วมแสดงความคิดเห็น
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0 origin-center transition-transform group-open:rotate-180" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </summary>
                  <ol className="mt-2 list-decimal rounded-xl bg-[rgba(8,52,88,0.45)] py-3 pr-4 pl-8 text-white/90">
                    {TERMS.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ol>
                </details>

                {submitError && (
                  <p role="alert" className="mx-auto w-full max-w-[460px] rounded-xl border border-[#ffd0d0] bg-[rgba(150,20,40,0.55)] px-4 py-2.5 text-center text-[14.5px]">
                    บันทึกกระทงไม่สำเร็จ: {submitError}
                  </p>
                )}

                <div className="mt-auto flex justify-center gap-3">
                  <button type="button" className={backBtn} onClick={() => goTo(2)} disabled={submitting}>
                    <span aria-hidden="true">‹</span> กลับไป
                  </button>
                  <button type="submit" className={`${primaryBtn} px-7`} disabled={!canSubmit || submitting} aria-busy={submitting}>
                    {submitting ? 'กำลังลอยกระทง…' : 'ลอยกระทงกันเลย'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
