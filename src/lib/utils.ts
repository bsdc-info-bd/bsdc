/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/bn';

dayjs.extend(relativeTime);

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/^-|-$/g, '');
}

export function randomId(len = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const values = new Uint32Array(len);
    cryptoObj.getRandomValues(values);
    for (let i = 0; i < len; i += 1) out += chars[values[i] % chars.length];
  } else {
    for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function timeAgo(timestamp: number | null | undefined, locale = 'en'): string {
  if (!timestamp) return '';
  const d = dayjs(timestamp);
  return locale === 'bn' ? d.locale('bn').fromNow() : d.fromNow();
}

export function formatDate(timestamp: number | null | undefined, pattern = 'MMM D, YYYY'): string {
  if (!timestamp) return '';
  return dayjs(timestamp).format(pattern);
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  return dayjs(timestamp).format('MMM D, YYYY · h:mm A');
}

export function formatNumber(n: number | null | undefined, locale = 'en'): string {
  const value = n || 0;
  const intlLocale = locale === 'bn' ? 'bn-BD' : 'en-US';
  return new Intl.NumberFormat(intlLocale, { notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

export function formatCurrency(amount: number, currency: 'BDT' | 'USD', locale = 'en'): string {
  const intlLocale = locale === 'bn' ? 'bn-BD' : 'en-US';
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function extractDescription(body: string, fallback = ''): string {
  const stripped = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`~[\]()!|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(stripped || fallback, 158);
}

export function extractTagsFromBody(body: string): string[] {
  const matches = body.match(/(?:^|\s)#([\p{L}\p{N}_]{2,30})/gu) || [];
  return Array.from(new Set(matches.map((m) => m.trim().slice(1).toLowerCase()))).slice(0, 10);
}

export function extractMentions(body: string): string[] {
  const matches = body.match(/(?:^|\s)@([a-z0-9_]{3,20})/gi) || [];
  return Array.from(new Set(matches.map((m) => m.trim().slice(1).toLowerCase())));
}

export function extractFirstUrl(body: string): string | null {
  const match = body.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0] : null;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function uniqueUsernameSeed(email: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'dev';
  return `${base}_${randomId(4)}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function todayKey(timestamp = Date.now()): string {
  return dayjs(timestamp).format('YYYY-MM-DD');
}

export function daysBetween(a: number, b: number): number {
  return Math.abs(dayjs(a).startOf('day').diff(dayjs(b).startOf('day'), 'day'));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      resolve();
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Copy failed'));
    }
  });
}

export function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/** Deterministic light background for text-only stories/banners. */
const STORY_BG = ['#0A8F3F', '#1877F2', '#14B8A6', '#7C3AED', '#DB2777', '#EA580C', '#0F766E'];
export function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return STORY_BG[hash % STORY_BG.length];
}

export function audioSrc(): string {
  /* Tiny, dependency-free notification blip generated as a WAV data URI. */
  const sampleRate = 8000;
  const samples = new Uint8Array(sampleRate * 0.12);
  const dv = new DataView(samples.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.max(0, 1 - t / 0.12);
    const freq = t < 0.06 ? 880 : 660;
    dv.setUint8(i, Math.round(128 + 60 * envelope * Math.sin(2 * Math.PI * freq * t)));
  }
  const b64 = btoa(String.fromCharCode(...samples));
  return `data:audio/wav;base64,${b64}`;
}
