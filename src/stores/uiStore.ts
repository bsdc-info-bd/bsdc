/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { create } from 'zustand';
import type { LanguagePreference, ThemePreference } from '@/types/common';
import type { PostSort } from '@/types/post';
import type { SystemSettings } from '@/types/domain';
import { DEFAULT_SYSTEM_SETTINGS } from '@/types/domain';

interface UIState {
  theme: ThemePreference;
  language: LanguagePreference;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  soundEnabled: boolean;
  activeFeed: PostSort;
  systemSettings: SystemSettings;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  setLanguage: (language: LanguagePreference) => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setActiveFeed: (feed: PostSort) => void;
  setSystemSettings: (settings: SystemSettings) => void;
}

const initialTheme: ThemePreference =
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';
const initialLanguage: LanguagePreference =
  typeof localStorage !== 'undefined' && localStorage.getItem('bsdc-language') === 'bn' ? 'bn' : 'en';
const initialSound = typeof localStorage !== 'undefined' ? localStorage.getItem('bsdc-sound') !== 'off' : true;
const initialFeed = (typeof localStorage !== 'undefined'
  ? localStorage.getItem('bsdc-active-feed')
  : null) as PostSort | null;

function persistTheme(theme: ThemePreference) {
  try {
    localStorage.setItem('bsdc-theme', theme);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

function persistLanguage(language: LanguagePreference) {
  try {
    localStorage.setItem('bsdc-language', language);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = language;
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: initialTheme,
  language: initialLanguage,
  mobileNavOpen: false,
  commandPaletteOpen: false,
  shortcutsOpen: false,
  soundEnabled: initialSound,
  activeFeed: initialFeed || 'forYou',
  systemSettings: DEFAULT_SYSTEM_SETTINGS,
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    persistTheme(next);
    set({ theme: next });
  },
  setLanguage: (language) => {
    persistLanguage(language);
    set({ language });
  },
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setSoundEnabled: (soundEnabled) => {
    try {
      localStorage.setItem('bsdc-sound', soundEnabled ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    set({ soundEnabled });
  },
  setActiveFeed: (activeFeed) => {
    try {
      localStorage.setItem('bsdc-active-feed', activeFeed);
    } catch {
      /* storage unavailable */
    }
    set({ activeFeed });
  },
  setSystemSettings: (systemSettings) => set({ systemSettings }),
}));
