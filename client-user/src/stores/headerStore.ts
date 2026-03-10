import { create } from 'zustand';

interface HeaderState {
  isVisible: boolean;
  scrollY: number;
  setVisible: (v: boolean) => void;
  setScrollY: (y: number) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  isVisible: true,
  scrollY: 0,
  setVisible: (isVisible) => set({ isVisible }),
  setScrollY: (scrollY) => set({ scrollY }),
}));
