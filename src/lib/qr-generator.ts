/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import QRCode from 'qrcode';

export async function generateQrDataUrl(text: string, size = 256): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0F0F0F', light: '#FFFFFF' },
  });
}

export async function generateQrCanvas(text: string, size = 256, logoDataUrl?: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  await QRCode.toCanvas(canvas, text, { width: size, margin: 2, color: { dark: '#0F0F0F', light: '#FFFFFF' } });
  if (logoDataUrl) {
    const logo = new Image();
    logo.src = logoDataUrl;
    await new Promise<void>((resolve, reject) => {
      logo.onload = () => resolve();
      logo.onerror = () => reject(new Error('Logo failed to load'));
    });
    const lSize = Math.round(size * 0.18);
    const pad = Math.round(lSize * 0.08);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(size / 2 - lSize / 2 - pad, size / 2 - lSize / 2 - pad, lSize + pad * 2, lSize + pad * 2);
    ctx.drawImage(logo, size / 2 - lSize / 2, size / 2 - lSize / 2, lSize, lSize);
  }
  return canvas;
}

export interface PointsTransferQrPayload {
  v: 1;
  app: 'BSDC';
  type: 'points_transfer';
  fromUid: string;
  fromUsername: string;
  amount: number;
  note: string;
  issuedAt: number;
}

export function encodeTransferPayload(payload: PointsTransferQrPayload): string {
  return JSON.stringify(payload);
}
