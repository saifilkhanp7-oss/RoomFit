import { create } from 'zustand';

interface ToastState {
  message: string | null;
  show: (msg: string) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    if (timer) clearTimeout(timer);
    set({ message });
    timer = setTimeout(() => set({ message: null }), 2200);
  },
}));

export function Toast() {
  const message = useToast((s) => s.message);
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
