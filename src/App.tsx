import { useCallback, useState } from 'react';
import scene from './assets/bg/scene.webp';
import sceneMobile from './assets/bg/scene-mobile.webp';
import { MOBILE_PORTRAIT } from './lib/media';
import CreateKrathongWizard from './components/CreateKrathongWizard';
import Hero from './components/Hero';
import Navbar from './components/Navbar';
import River from './components/River';
import WelcomePopup from './components/WelcomePopup';
import WishesModal from './components/WishesModal';
import { useKrathongs } from './hooks/useKrathongs';
import type { ModalName, NewKrathong } from './types';

export default function App() {
  const { all, count, loadError, latestId, addKrathong, refresh } = useKrathongs();
  const [modal, setModal] = useState<ModalName>(null);
  /** ความสูงของฉากหลัง (px) = ตำแหน่งร่องคลื่นแรกของแม่น้ำ */
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
          <River krathongs={all} latestId={latestId} onSceneBottom={setSceneBottom} />

          {/* เชื่อมต่อฐานข้อมูลไม่ได้: แจ้งแบบสุภาพ หน้าเว็บยังใช้ได้ (แม่น้ำแสดงกระทงตัวอย่าง) */}
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
    </>
  );
}
