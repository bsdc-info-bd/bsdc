import { create } from 'zustand';

interface UiState {
  commandPaletteOpen: boolean;
  mobileMenuOpen: boolean;
  online: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  setOnline: (online: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  commandPaletteOpen: false,
  mobileMenuOpen: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  setOnline: (online) => set({ online }),
}));
