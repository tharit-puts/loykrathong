import { useCallback, useRef, useState } from 'react';
import scene from './assets/bg/scene.webp';
import sceneMobile from './assets/bg/scene-mobile.webp';
import qrCode from './assets/qr-code.png';
import { MOBILE_PORTRAIT } from './lib/media';
import CreateKrathongWizard from './components/CreateKrathongWizard';
import Hero from './components/Hero';
import Navbar from './components/Navbar';
import NotificationsHost from './components/Notifications';
import River from './components/River';
import WelcomePopup from './components/WelcomePopup';
import WishesModal from './components/WishesModal';
import { useKrathongs } from './hooks/useKrathongs';
import { useLuckyDraw } from './hooks/useLuckyDraw';
import type { ModalName, NewKrathong } from './types';

export default function App() {
  const [modal, setModal] = useState<ModalName>(null);
  // เด็กเก็บเหรียญไม่เล่นตอน modal สร้างกระทงเปิดอยู่ (เหรียญหายเงียบๆ แทน)
  const modalRef = useRef(modal);
  modalRef.current = modal;
  const canAnimate = useCallback(() => modalRef.current !== 'create', []);
  const { all, count, loadError, latestId, addKrathong, refresh, collecting, onKidBend, onKidFinish } = useKrathongs({
    canAnimate,
  });
  /** ความสูงของฉากหลัง (px) = ตำแหน่งร่องคลื่นแรกของแม่น้ำ */
  /** เจ้าแม่คงคาประกาศผู้โชคดี (สถานะจาก server) */
  const luckyDraw = useLuckyDraw();
  const [sceneBottom, setSceneBottom] = useState<number | null>(null);

  const closeModal = useCallback(() => setModal(null), []);

  /** บันทึกสำเร็จแล้วค่อยปิดหน้าต่าง (ล้มเหลว → error ส่งกลับไปให้ฟอร์มแสดง) */
  const handleCreate = async (data: NewKrathong) => {
    await addKrathong(data);
    setModal(null);
  };

  return (
    <>
      {/* ทั้งหน้าพอดีจอ ไม่ให้เลื่อน: แม่น้ำยืดกินพื้นที่ที่เหลือใต้ Hero */}
      <div className="flex h-dvh flex-col overflow-hidden">
        <Navbar onOpenWishes={() => setModal('wishes')} />

        <main className="relative flex min-h-0 flex-1 flex-col">
          {/*
           * ฉากหลัง: พอดีกับพื้นที่ใต้ navbar ถึงขอบบนแม่น้ำ (River บอกตำแหน่งมา)
           * มือถือแนวตั้งใช้ภาพแนวตั้ง ยึดที่ 12% จากบน ให้เห็นทั้งพระจันทร์และป้ายคลองเตย (ส่วนล่างของภาพอยู่หลังแม่น้ำ)
           */}
          <picture>
            <source media={MOBILE_PORTRAIT} srcSet={sceneMobile} />
            <img
              src={scene}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-x-0 top-0 h-full w-full object-cover saturate-[0.9] brightness-95 select-none mobile-portrait:object-[50%_12%]"
              style={sceneBottom ? { height: sceneBottom } : undefined}
            />
          </picture>
          {/* scrim + vignette ทับภาพ (สูงเท่าภาพ) ให้ข้อความและปุ่มเด่นขึ้น — Hero/River มาทีหลังใน DOM จึงอยู่ด้านบน */}
          <div
            aria-hidden="true"
            className="scene-scrim pointer-events-none absolute inset-x-0 top-0 h-full"
            style={sceneBottom ? { height: sceneBottom } : undefined}
          />
          <Hero count={count} onCreate={() => setModal('create')} />
          {/* QR code มุมขวาบน: เฉพาะจอกว้าง 900px ขึ้นไป (จอแคบกว่านี้จะชนป้ายโลโก้ และมือถือไม่ต้องแสดง) — การ์ดพื้นขาวเป็นขอบว่าง (quiet zone) ให้สแกนติดง่าย */}
          <div className="absolute top-4 right-4 hidden rounded-2xl border-2 border-gold bg-white p-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.4),0_0_14px_rgba(232,184,74,0.35)] min-[900px]:block">
            <img src={qrCode} alt="QR code" width={384} height={384} draggable={false} className="block size-[clamp(104px,9vw,140px)] select-none" />
          </div>
          <River
            krathongs={all}
            latestId={latestId}
            onSceneBottom={setSceneBottom}
            collectingId={collecting?.id ?? null}
            onKidBend={onKidBend}
            onKidFinish={onKidFinish}
            luckyDraw={luckyDraw}
          />

          {/* เชื่อมต่อฐานข้อมูลไม่ได้: แจ้งแบบสุภาพ หน้าเว็บยังใช้ได้ */}
          {loadError && (
            <div
              role="status"
              className="absolute inset-x-0 top-2 z-30 mx-auto flex w-fit max-w-[calc(100vw-24px)] items-center gap-3 rounded-full border border-white/30 bg-[rgba(20,25,60,0.92)] py-1.5 pr-1.5 pl-4 text-[14px] text-ink shadow-lg backdrop-blur-md"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={refresh}
                className="min-h-9 shrink-0 rounded-full border border-gold px-3 font-head text-gold2 hover:bg-white/10"
              >
                ลองใหม่
              </button>
            </div>
          )}
        </main>
      </div>

      <CreateKrathongWizard open={modal === 'create'} onClose={closeModal} onSubmit={handleCreate} />
      <WishesModal open={modal === 'wishes'} onClose={closeModal} />
      {/* popup ต้อนรับ: ขึ้นเฉพาะครั้งแรกที่เข้าเว็บ */}
      <WelcomePopup />
      {/* แจ้งเตือน (toast) ตัวเดียวของทั้งเว็บ: อยู่เหนือ popup และหน้าต่างสร้างกระทงเสมอ */}
      <NotificationsHost />
    </>
  );
}
