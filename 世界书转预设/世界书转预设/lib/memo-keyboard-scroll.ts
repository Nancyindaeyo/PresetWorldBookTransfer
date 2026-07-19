import { getTavernWindow } from '@util/tavern-context';

/** 键盘占用的高度（基于酒馆主页面 visualViewport，非脚本 iframe） */
export function getKeyboardInset(): number {
  const win = getTavernWindow();
  const vv = win.visualViewport;
  if (!vv) return 0;
  return Math.max(0, win.innerHeight - vv.height - vv.offsetTop);
}

export function isKeyboardLikelyOpen(threshold = 40): boolean {
  return getKeyboardInset() > threshold;
}

export type VisibleViewport = {
  top: number;
  bottom: number;
};

/**
 * 备忘录列表内 field 的有效可视区：以 #preset-memo-list 的 client 区域为准，
 * 键盘弹出时再与 visualViewport 底部取交集（避免用整屏 bottom 误判）。
 */
export function getMemoFieldVisibleBounds(scroller: HTMLElement, margin = 12): VisibleViewport {
  const sr = scroller.getBoundingClientRect();
  let top = sr.top + margin;
  let bottom = sr.bottom - margin;

  if (isKeyboardLikelyOpen()) {
    const vv = getTavernWindow().visualViewport;
    if (vv) {
      bottom = Math.min(bottom, vv.offsetTop + vv.height - margin);
    }
  }

  return { top, bottom: Math.max(top, bottom) };
}

export function isMemoFieldVisible(
  field: HTMLElement,
  scroller: HTMLElement,
  margin = 12,
  viewportOverride?: VisibleViewport | null,
): boolean {
  const viewport = viewportOverride ?? getMemoFieldVisibleBounds(scroller, margin);
  const rect = field.getBoundingClientRect();
  return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
}

/**
 * 计算 list 滚动容器为让 field 完整落在列表可视区内所需的最小 scrollTop 增量。
 */
export function computeListScrollDelta(
  field: HTMLElement,
  scroller: HTMLElement,
  margin = 12,
  viewportOverride?: VisibleViewport | null,
): number {
  const viewport = viewportOverride ?? getMemoFieldVisibleBounds(scroller, margin);
  const rect = field.getBoundingClientRect();
  if (rect.top >= viewport.top && rect.bottom <= viewport.bottom) return 0;
  if (rect.bottom > viewport.bottom) return rect.bottom - viewport.bottom;
  if (rect.top < viewport.top) return rect.top - viewport.top;
  return 0;
}

export type PinnedScrollState = {
  winY: number;
  listTop: number;
};

export function pinMemoScrollState(scroller: HTMLElement | null | undefined): PinnedScrollState {
  return {
    winY: getTavernWindow().scrollY,
    listTop: scroller?.scrollTop ?? 0,
  };
}

/** 撤销浏览器 focus 时对酒馆页面 / 列表的默认滚动 */
export function restorePinnedScrollState(
  pinned: PinnedScrollState,
  scroller: HTMLElement | null | undefined,
): void {
  const win = getTavernWindow();
  if (Math.abs(win.scrollY - pinned.winY) > 1) {
    win.scrollTo({ top: pinned.winY, left: 0, behavior: 'auto' });
  }
  if (scroller && Math.abs(scroller.scrollTop - pinned.listTop) > 1) {
    scroller.scrollTop = pinned.listTop;
  }
}

export function scrollFieldIntoVisibleViewport(
  field: HTMLElement,
  scroller: HTMLElement,
  options?: { margin?: number },
): void {
  const delta = computeListScrollDelta(field, scroller, options?.margin ?? 12);
  if (delta !== 0) scroller.scrollTop += delta;
}

/** 仅当 field 不在列表可视区内（或键盘已弹出）时才滚动 */
export function scrollMemoFieldIfNeeded(
  field: HTMLElement,
  scroller: HTMLElement | null | undefined,
  options?: { margin?: number; force?: boolean },
): void {
  if (!scroller) return;
  const margin = options?.margin ?? 12;
  const keyboardOpen = isKeyboardLikelyOpen();
  if (!options?.force && !keyboardOpen && isMemoFieldVisible(field, scroller, margin)) return;
  scrollFieldIntoVisibleViewport(field, scroller, { margin });
}

export function scheduleScrollMemoFieldIfNeeded(
  field: HTMLElement,
  scroller: HTMLElement | null | undefined,
  options?: { margin?: number; force?: boolean },
): void {
  if (!scroller) return;
  const pinned = pinMemoScrollState(scroller);
  const run = () => {
    restorePinnedScrollState(pinned, scroller);
    scrollMemoFieldIfNeeded(field, scroller, options);
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}
