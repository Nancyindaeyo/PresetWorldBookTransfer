import { getTavernDocument } from '@util/tavern-context';
import { detectTavernLightMode } from './tavern-theme-sync';
import {
  buildPmThemeCssVars,
  buildPmTavernManualCssVars,
  defaultPmTavernManualColors,
  PM_THEME_STYLE_TAVERN,
  PM_TOKEN_VAR_MAP,
  themePreviewFingerprint,
  type PmThemeMode,
  type PmThemeSettings,
} from '../theme';

let lastFingerprint = '';

const THEME_INLINE_VAR_KEYS = [...Object.values(PM_TOKEN_VAR_MAP), '--pm-checkbox-fill'];
const TAVERN_MANUAL_VAR_KEYS = [
  '--pm-success',
  '--pm-warning',
  '--pm-warning-bg',
  '--pm-warning-text',
  '--pm-danger-base',
  '--pm-danger',
  '--pm-danger-soft',
];

export function resetPmThemeFingerprint() {
  lastFingerprint = '';
}

function clearThemeInlineVars(el: HTMLElement | null) {
  if (!el) return;
  for (const key of [...THEME_INLINE_VAR_KEYS, ...TAVERN_MANUAL_VAR_KEYS]) {
    el.style.removeProperty(key);
  }
}

function resolveLightMode(settings: PmThemeSettings): boolean {
  if (settings.style === PM_THEME_STYLE_TAVERN) return detectTavernLightMode();
  return settings.mode === 'light';
}

function resolveTavernManualMode(settings: PmThemeSettings): PmThemeMode {
  return resolveLightMode(settings) ? 'light' : 'dark';
}

/** 将日/夜间类名与 token 变量同步到模态框 DOM（参考世界书管理器 applyThemeToModal） */
export function applyPmThemeToModal(settings: PmThemeSettings, force = false) {
  const fp = themePreviewFingerprint(settings);
  if (!force && fp === lastFingerprint) return;
  lastFingerprint = fp;

  const doc = getTavernDocument();
  const modal = doc.getElementById('preset-memo-modal');
  if (!modal) return;

  const content = doc.getElementById('preset-memo-modal-content');
  clearThemeInlineVars(content);
  clearThemeInlineVars(modal);

  const followTavern = settings.style === PM_THEME_STYLE_TAVERN;
  const light = resolveLightMode(settings);

  modal.classList.toggle('pm-light-mode', light);
  modal.classList.toggle('pm-tavern-theme', followTavern);

  if (followTavern) {
    const manualMode = resolveTavernManualMode(settings);
    const manual =
      settings.tavernManual?.[manualMode] ?? defaultPmTavernManualColors(manualMode);
    const manualVars = buildPmTavernManualCssVars(manual);
    for (const [key, value] of Object.entries(manualVars)) {
      modal.style.setProperty(key, value);
    }
    return;
  }

  const vars = buildPmThemeCssVars(settings[settings.mode]);
  for (const [key, value] of Object.entries(vars)) {
    modal.style.setProperty(key, value);
  }
}
