import { describe, expect, it } from 'vitest';
import {
  compactMacroPreview,
  hasSetvarMacros,
  resolveCotPreviewDisplayContent,
} from '../lib/cot-macro-preview';
import {
  isCotPrompt,
  isPlaceholderPresetPrompt,
  selectPreviewPromptsFromPreset,
  stitchCotPreview,
} from '../lib/cot-preset-preview';

describe('cot-macro-preview', () => {
  it('compacts long setvar to variable name summary', () => {
    const long = '{{setvar::结尾自定义::' + 'x'.repeat(200) + '}}';
    const out = compactMacroPreview(long);
    expect(out).toContain('setvar → 结尾自定义');
    expect(out).toContain('200 字');
    expect(out).not.toContain('x'.repeat(200));
  });

  it('keeps short setvar on one line', () => {
    const out = compactMacroPreview('{{setvar::结尾自定义cot:: [收尾要求]:如何执行?}}');
    expect(out).toContain('setvar::结尾自定义cot::');
    expect(out).toContain('[收尾要求]');
  });

  it('resolve prefers raw preset when setvar present', () => {
    const raw = '{{setvar::a::' + 'y'.repeat(100) + '}}';
    const out = resolveCotPreviewDisplayContent('expanded junk', raw);
    expect(hasSetvarMacros(raw)).toBe(true);
    expect(out).toContain('setvar → a');
  });
});

describe('cot-preset-preview', () => {
  it('isCotPrompt matches keywords and tags', () => {
    expect(isCotPrompt('main', 'hello')).toBe(false);
    expect(isCotPrompt('思维链引导', '')).toBe(true);
    expect(isCotPrompt('x', 'use <thinking> here')).toBe(true);
    expect(isCotPrompt('reasoning step', '')).toBe(true);
  });

  it('selectPreviewPromptsFromPreset returns all enabled prompts and detects cot mode', () => {
    const prompts = [
      {
        id: 'main',
        name: 'Main',
        content: 'sys',
        enabled: true,
        role: 'system' as const,
        position: { type: 'relative' as const },
      },
      {
        id: 'cot1',
        name: 'CoT',
        content: '<thinking>',
        enabled: true,
        role: 'system' as const,
        position: { type: 'relative' as const },
      },
      {
        id: 'worldInfoBefore',
        name: 'WI',
        enabled: true,
        role: 'system' as const,
        position: { type: 'relative' as const },
      },
    ] as PresetPrompt[];

    const cot = selectPreviewPromptsFromPreset(prompts);
    expect(cot.mode).toBe('cot');
    expect(cot.items.map(p => p.id)).toEqual(['main', 'cot1', 'worldInfoBefore']);

    const noCot = selectPreviewPromptsFromPreset([
      {
        id: 'main',
        name: 'Main',
        content: 'only main',
        enabled: true,
        role: 'system',
        position: { type: 'relative' },
      },
      {
        id: 'charDescription',
        name: '<char>设定',
        enabled: true,
        role: 'system',
        position: { type: 'relative' },
      },
    ] as PresetPrompt[]);
    expect(noCot.mode).toBe('preset-slice');
    expect(noCot.items.length).toBe(2);
  });

  it('isPlaceholderPresetPrompt excludes chatHistory placeholder', () => {
    const p = {
      id: 'chatHistory',
      name: 'Chat',
      enabled: true,
      role: 'system' as const,
      position: { type: 'relative' as const },
    } as PresetPrompt;
    expect(isPlaceholderPresetPrompt(p)).toBe(true);
  });

  it('stitchCotPreview joins items', () => {
    const text = stitchCotPreview([
      {
        name: 'A',
        identifier: 'a',
        role: 'system',
        positionLabel: '相对位置',
        content: 'line1',
      },
    ]);
    expect(text).toContain('1. A');
    expect(text).toContain('line1');
  });

  it('stitchCotPreview lists placeholder entry name with placeholder label', () => {
    const text = stitchCotPreview([
      {
        name: '<char>设定',
        identifier: 'charDescription',
        role: 'system',
        positionLabel: '相对位置',
        content: '',
        isPlaceholder: true,
      },
    ]);
    expect(text).toContain('<char>设定');
    expect(text).toContain('占位符');
  });
});
