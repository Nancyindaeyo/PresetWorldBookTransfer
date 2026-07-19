import { describe, expect, it } from 'vitest';
import {
  computeListScrollDelta,
  getMemoFieldVisibleBounds,
  isMemoFieldVisible,
} from '../lib/memo-keyboard-scroll';

function fieldAt(top: number, bottom: number): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  } as HTMLElement;
}

function scrollerAt(top: number, bottom: number): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
    scrollTop: 0,
  } as HTMLElement;
}

describe('memo-keyboard-scroll', () => {
  it('uses list scroller bounds instead of full screen', () => {
    const scroller = scrollerAt(200, 600);
    const field = fieldAt(520, 640);
    const bounds = getMemoFieldVisibleBounds(scroller, 12);

    expect(bounds.top).toBe(212);
    expect(bounds.bottom).toBe(588);
    expect(isMemoFieldVisible(field, scroller, 12, bounds)).toBe(false);

    const delta = computeListScrollDelta(field, scroller, 12, bounds);
    expect(delta).toBe(52);
    expect(delta).toBeLessThan(200);
  });

  it('returns 0 when field fits inside scroller viewport', () => {
    const scroller = scrollerAt(200, 600);
    const field = fieldAt(260, 360);
    const bounds = getMemoFieldVisibleBounds(scroller, 12);

    expect(computeListScrollDelta(field, scroller, 12, bounds)).toBe(0);
  });

  it('scrolls minimally when bottom slightly exceeds scroller', () => {
    const scroller = scrollerAt(200, 600);
    const field = fieldAt(540, 610);
    const bounds = getMemoFieldVisibleBounds(scroller, 12);

    expect(computeListScrollDelta(field, scroller, 12, bounds)).toBe(22);
  });
});
