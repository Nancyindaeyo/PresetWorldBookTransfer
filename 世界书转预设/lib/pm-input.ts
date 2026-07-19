/**
 * 预设备忘录输入与 Macro 补全策略
 *
 * 面板打开期间：只 stamp 属性 + 清理浮层，绝不 detach/destroy（destroy 会拆 autoComplete_wrapper 导致无法输入）
 * 面板关闭时：再 detach 并 suppress
 */

import {
  blurWithin,
  detachMacroAutocompleteIn,
  getTavernDocument,
  removeOrphanMacroAutocompleteDom,
  stampInputAutocompleteHiddenIn,
  suppressStaleTavernAutocomplete,
} from '@util/tavern-autocomplete';

export const PM_MODAL_ID = 'preset-memo-modal';

/** 面板打开 / Vue 重绘后：仅 stamp，不 detach */
export function restampPmModalAutocomplete(): void {
  const modal = getTavernDocument().getElementById(PM_MODAL_ID);
  stampInputAutocompleteHiddenIn(modal);
  removeOrphanMacroAutocompleteDom();
}

export function cleanupPmOnClose(): void {
  const modal = getTavernDocument().getElementById(PM_MODAL_ID);
  blurWithin(modal);
  suppressStaleTavernAutocomplete();
  if (modal) {
    detachMacroAutocompleteIn(modal);
    removeOrphanMacroAutocompleteDom();
  }
}

export function setupPmModalInputGuard(): void {
  restampPmModalAutocomplete();
}
