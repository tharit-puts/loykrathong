import { useCallback, useState } from 'react';
import scene from './assets/bg/scene.webp';
import CreateKrathongWizard from './components/CreateKrathongWizard';
import Hero from './components/Hero';
import Navbar from './components/Navbar';
import River from './components/River';
import WishesModal from './components/WishesModal';
import { useKrathongs } from './hooks/useKrathongs';
import type { ModalName, NewKrathong } from './types';

export default function App() {
  const { all, count, latestId, addKrathong } = useKrathongs();
  const [modal, setModal] = useState<ModalName>(null);
  /** ความสูงของฉากหลัง (px) = ตำแหน่งร่องคลื่นแรกของแม่น้ำ */
  const [sceneBottom, setSceneBottom] = useState<number | null>(null);

  const closeModal = useCallback(() => setModal(null), []);

  const handleCreate = (data: NewKrathong) => {
    addKrathong(data);
    setModal(null);
  };

  return (
    <>
      {/* ทั้งหน้าพอดีจอ ไม่ให้เลื่อน: แม่น้ำยืดกินพื้นที่ที่เหลือใต้ Hero */}
      <div className="flex h-dvh flex-col overflow-hidden">
        <Navbar onOpenWishes={() => setModal('wishes')} />

        <main className="relative flex min-h-0 flex-1 flex-col">
          {/* ฉากหลัง: พอดีกับพื้นที่ใต้ navbar ถึงขอบบนแม่น้ำ (River บอกตำแหน่งมา) */}
          <img
            src={scene}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-x-0 top-0 h-full w-full object-cover saturate-[0.9] brightness-95 select-none"
            style={sceneBottom ? { height: sceneBottom } : undefined}
          />
          {/* scrim + vignette ทับภาพ (สูงเท่าภาพ) ให้ข้อความและปุ่มเด่นขึ้น — Hero/River มาทีหลังใน DOM จึงอยู่ด้านบน */}
          <div
            aria-hidden="true"
            className="scene-scrim pointer-events-none absolute inset-x-0 top-0 h-full"
            style={sceneBottom ? { height: sceneBottom } : undefined}
          />
          <Hero count={count} onCreate={() => setModal('create')} />
          <River krathongs={all} latestId={latestId} onSceneBottom={setSceneBottom} />
        </main>
      </div>

      <CreateKrathongWizard open={modal === 'create'} onClose={closeModal} onSubmit={handleCreate} />
      <WishesModal open={modal === 'wishes'} onClose={closeModal} krathongs={all} />
    </>
  );
}
