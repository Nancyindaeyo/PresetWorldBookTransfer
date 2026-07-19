import _ from 'lodash';
import { onMounted, onUnmounted, type Ref } from 'vue';
import { getTavernDocument } from '@util/tavern-autocomplete';
import { PM_MODAL_ID, restampPmModalAutocomplete } from '../lib/pm-input';

/**
 * Vue 更新 DOM 后 debounce restamp。
 * 用户正在输入时跳过 restamp，避免与 Macro wrapper / Vue patch 抢焦点。
 */
export function usePanelPmInput(pmRootRef: Ref<HTMLElement | null>) {
  let debouncedRestamp: ReturnType<typeof _.debounce> | null = null;

  onMounted(() => {
    const modal =
      getTavernDocument().getElementById(PM_MODAL_ID) ??
      pmRootRef.value?.closest(`#${PM_MODAL_ID}`) ??
      null;
    if (!modal) return;

    // 输入焦点阶段仅依赖 focusin/pointerdown 的即时打标，避免全量 DOM 观察导致频繁重打标抢焦点
    debouncedRestamp = _.debounce(() => restampPmModalAutocomplete(), 120);
    debouncedRestamp();
  });

  onUnmounted(() => {
    debouncedRestamp?.cancel();
    debouncedRestamp = null;
  });
}
