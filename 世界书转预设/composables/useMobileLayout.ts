import { onMounted, onUnmounted, ref } from 'vue';
import { getTavernWindow } from '@util/tavern-autocomplete';
import { getKeyboardInset } from '../lib/memo-keyboard-scroll';

const MOBILE_MQ = '(max-width: 1024px)';

export function useMobileLayout() {
  const isMobile = ref(false);
  let mq: MediaQueryList | null = null;
  let onChange: (() => void) | null = null;

  onMounted(() => {
    mq = window.matchMedia(MOBILE_MQ);
    onChange = () => {
      isMobile.value = mq!.matches;
    };
    onChange();
    mq.addEventListener('change', onChange);
  });

  onUnmounted(() => {
    if (mq && onChange) mq.removeEventListener('change', onChange);
  });

  return { isMobile };
}

/** 根据酒馆主页面 visualViewport 为面板底部留出键盘占位 */
export function useKeyboardInset(rootRef: { value: HTMLElement | null }) {
  function applyInset() {
    const root = rootRef.value;
    if (!root) return;
    const inset = getKeyboardInset();
    if (inset > 40) {
      root.style.setProperty('--pm-keyboard-inset', `${inset}px`);
      root.classList.add('pm-keyboard-open');
    } else {
      root.style.removeProperty('--pm-keyboard-inset');
      root.classList.remove('pm-keyboard-open');
    }
  }

  onMounted(() => {
    const win = getTavernWindow();
    const vv = win.visualViewport;
    if (!vv) return;
    vv.addEventListener('resize', applyInset);
    vv.addEventListener('scroll', applyInset);
    applyInset();
  });

  onUnmounted(() => {
    const win = getTavernWindow();
    const vv = win.visualViewport;
    if (vv) {
      vv.removeEventListener('resize', applyInset);
      vv.removeEventListener('scroll', applyInset);
    }
    if (rootRef.value) {
      rootRef.value.style.removeProperty('--pm-keyboard-inset');
      rootRef.value.classList.remove('pm-keyboard-open');
    }
  });

  return { applyInset };
}
