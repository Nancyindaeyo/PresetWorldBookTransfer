import { getTavernDocument } from '@util/tavern-context';
import { detectTavernLightMode } from './tavern-theme-sync';
import {
  buildPmThemeCssVars,
  PM_THEME_STYLE_TAVERN,
  PM_TOKEN_VAR_MAP,
  themePreviewFingerprint,
  type PmThemeSettings,
} from '../theme';

let lastFingerprint = '';

const THEME_INLINE_VAR_KEYS = [...Object.values(PM_TOKEN_VAR_MAP), '--pm-checkbox-fill'];

export function resetPmThemeFingerprint() {
  lastFingerprint = '';
}

function clearThemeInlineVars(el: HTMLElement | null) {
  if (!el) return;
  for (const key of THEME_INLINE_VAR_KEYS) {
    el.style.removeProperty(key);
  }
}

function resolveLightMode(settings: PmThemeSettings): boolean {
  if (settings.style === PM_THEME_STYLE_TAVERN) return detectTavernLightMode();
  return settings.mode === 'light';
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

  if (followTavern) return;

  const vars = buildPmThemeCssVars(settings[settings.mode]);
  for (const [key, value] of Object.entries(vars)) {
    modal.style.setProperty(key, value);
  }
}
