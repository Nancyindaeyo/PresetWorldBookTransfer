import { getTavernDocument } from '../../世界书管理器/lib/tavern-autocomplete';
import {
  buildPmThemeCssVars,
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

/** 将日/夜间类名与 token 变量同步到模态框 DOM（参考世界书管理器 applyThemeToModal） */
export function applyPmThemeToModal(settings: PmThemeSettings, force = false) {
  const fp = themePreviewFingerprint(settings);
  if (!force && fp === lastFingerprint) return;
  lastFingerprint = fp;

  const doc = getTavernDocument();
  const modal = doc.getElementById('preset-memo-modal');
  if (!modal) return;

  // 派生变量 (--pm-bg / --pm-primary 等) 定义在 #preset-memo-modal 上并用 var(--pm-surface) 引用；
  // token 必须写在同一元素上，写在 content 子节点不会参与父级 var() 解析。
  const content = doc.getElementById('preset-memo-modal-content');
  clearThemeInlineVars(content);

  const light = settings.mode === 'light';
  const vars = buildPmThemeCssVars(settings[settings.mode]);

  modal.classList.toggle('pm-light-mode', light);
  for (const [key, value] of Object.entries(vars)) {
    modal.style.setProperty(key, value);
  }
}
