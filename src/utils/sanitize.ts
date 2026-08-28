const SANITIZE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, replacement: '' },
  { pattern: /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, replacement: '' },
  { pattern: /on\w+\s*=\s*"[^"]*"/gi, replacement: '' },
  { pattern: /on\w+\s*=\s*'[^']*'/gi, replacement: '' },
  { pattern: /javascript\s*:/gi, replacement: '' },
  { pattern: /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, replacement: '' },
  { pattern: /<embed\b[^>]*>/gi, replacement: '' },
  { pattern: /<link\b[^>]*>/gi, replacement: '' },
  { pattern: /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, replacement: '' },
];

export const sanitizeHtml = (html: string): string => {
  let sanitized = html;
  for (const { pattern, replacement } of SANITIZE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
};

export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
};

export const stripHtml = (html: string): string => {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
};

export const extractExcerpt = (markdown: string, maxLength: number = 160): string => {
  const plain = markdown
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '')
    .replace(/\d+\.\s/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return truncateText(plain, maxLength);
};

export const calculateReadingTime = (text: string): number => {
  const wordsPerMinute = 200;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
};

export const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export const isSafeRedirectUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
};

export const detectMaliciousUrl = (url: string): boolean => {
  const suspiciousPatterns = [
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /file:/i,
    /chrome:/i,
    /about:/i,
  ];
  return suspiciousPatterns.some((pattern) => pattern.test(url));
};
