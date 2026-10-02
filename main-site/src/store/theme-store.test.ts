import { beforeEach, describe, expect, it } from 'vitest';
import { resolveTheme, THEME_STORAGE_KEY, useThemeStore } from './theme-store';

describe('theme store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useThemeStore.getState().setPreference('light');
  });

  it('resolves explicit preferences directly', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('persists the preference and updates the document', () => {
    useThemeStore.getState().setPreference('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('toggles between light and dark', () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().resolved).toBe('dark');
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().resolved).toBe('light');
  });
});
