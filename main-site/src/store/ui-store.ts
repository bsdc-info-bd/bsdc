import { create } from 'zustand';

interface UiState {
  commandPaletteOpen: boolean;
  mobileMenuOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setMobileMenuOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  commandPaletteOpen: false,
  mobileMenuOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
}));
