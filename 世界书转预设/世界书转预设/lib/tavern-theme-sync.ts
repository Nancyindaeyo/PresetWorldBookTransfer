import { getTavernDocument } from '@util/tavern-context';

function parseCssColorLuminance(color: string): number | null {
  const v = color.trim();
  const hex6 = v.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    const r = Number(rgb[1]) / 255;
    const g = Number(rgb[2]) / 255;
    const b = Number(rgb[3]) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return null;
}

function readCssVar(doc: Document, name: string): string {
  return getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
}

/** 推断酒馆当前为日间还是夜间（用于跟随酒馆美化时的 pm-light-mode） */
export function detectTavernLightMode(doc: Document = getTavernDocument()): boolean {
  const body = doc.body;
  if (body.classList.contains('dark') || body.classList.contains('darkmode') || body.classList.contains('theme-dark')) {
    return false;
  }
  if (body.classList.contains('light') || body.classList.contains('theme-light')) {
    return true;
  }

  const tint = readCssVar(doc, '--SmartThemeBlurTintColor');
  const lum = tint ? parseCssColorLuminance(tint) : null;
  if (lum != null) return lum > 0.55;

  const bodyColor = readCssVar(doc, '--SmartThemeBodyColor');
  const bodyLum = bodyColor ? parseCssColorLuminance(bodyColor) : null;
  if (bodyLum != null) return bodyLum > 0.55;

  return false;
}
