import KrathongIcon from './KrathongIcon';
import Modal from './Modal';
import { KRATHONG_LABELS, type Krathong } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  krathongs: Krathong[];
}

export default function WishesModal({ open, onClose, krathongs }: Props) {
  const newestFirst = [...krathongs].reverse();

  return (
    <Modal open={open} title="คำอธิษฐานทั้งหมด" onClose={onClose}>
      <ul className="m-0 grid max-h-[60vh] list-none gap-2.5 overflow-auto p-0">
        {newestFirst.map((k) => (
          <li key={k.id} className="flex gap-3 rounded-[14px] bg-bg2 p-3">
            <KrathongIcon type={k.type} decorations={k.decorations} className="h-[47px] w-14 flex-none" />
            <div>
              <b className="font-head font-medium">{k.name}</b>
              {k.sample && (
                <span className="ml-1.5 rounded-lg bg-line px-2 py-px text-[12px] text-mute">ตัวอย่าง</span>
              )}
              <div className="text-[13px] text-mute">กระทง{KRATHONG_LABELS[k.type]}</div>
              <div>{k.wish}</div>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
