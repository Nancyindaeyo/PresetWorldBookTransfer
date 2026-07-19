import { describe, expect, it } from 'vitest';
import { applyPmJsonImport, buildPmJsonExport, PM_JSON_EXPORT_VERSION } from '../lib/json-io';
import type { MemoEntry } from '../schema';
import { PM_DEFAULT_DARK, PM_DEFAULT_LIGHT } from '../theme';

const sampleMemo: MemoEntry[] = [
  {
    id: 'm1',
    name: 'A',
    content: 'hello',
    enabled: true,
    role: 'system',
    position: { type: 'relative' },
    folder: '默认',
  },
];

const baseTheme = {
  mode: 'dark' as const,
  style: 'custom' as const,
  dark: { ...PM_DEFAULT_DARK },
  light: { ...PM_DEFAULT_LIGHT },
  customPresets: [],
};

describe('json-io', () => {
  it('exports full payload including theme and ui state', () => {
    const data = buildPmJsonExport({
      folders: ['默认', '文风'],
      folderMeta: { 文风: { pinned: true } },
      memo: sampleMemo,
      shortcuts: [{ label: 'x', insert: 'y' }],
      themeSettings: baseTheme,
      currentFolder: '文风',
      activeTab: 'tab-import',
    });
    expect(data.version).toBe(PM_JSON_EXPORT_VERSION);
    expect(data.themeSettings?.mode).toBe('dark');
    expect(data.pmUiState?.activeTab).toBe('tab-import');
    expect(data.pmUiState?.currentFolder).toBe('文风');
  });

  it('merge mode applies shortcuts theme and ui state', () => {
    const current = {
      folders: ['默认'],
      folderMeta: {},
      memo: [],
      shortcuts: [{ label: 'old', insert: 'old' }],
      themeSettings: baseTheme,
      currentFolder: '默认',
      activeTab: 'tab-memo' as const,
    };
    const imported = buildPmJsonExport({
      folders: ['默认', '新夹'],
      folderMeta: { 新夹: { pinned: false } },
      memo: sampleMemo,
      shortcuts: [{ label: 'new', insert: 'new' }],
      themeSettings: { ...baseTheme, mode: 'light' },
      currentFolder: '新夹',
      activeTab: 'tab-export-wb',
    });
    const result = applyPmJsonImport(imported, 'merge', current);
    expect(result.memo.length).toBe(1);
    expect(result.folders).toContain('新夹');
    expect(result.shortcuts[0].label).toBe('new');
    expect(result.themeSettings.mode).toBe('light');
    expect(result.activeTab).toBe('tab-export-wb');
    expect(result.summary.mergedShortcuts).toBe(true);
    expect(result.summary.mergedTheme).toBe(true);
  });

  it('replace mode replaces memo and metadata', () => {
    const current = {
      folders: ['默认', '旧'],
      folderMeta: { 旧: { pinned: true } },
      memo: sampleMemo,
      shortcuts: [{ label: 'old', insert: 'old' }],
      themeSettings: baseTheme,
      currentFolder: '默认',
      activeTab: 'tab-memo' as const,
    };
    const imported = buildPmJsonExport({
      folders: ['默认'],
      folderMeta: {},
      memo: [
        {
          id: 'm2',
          name: 'B',
          content: 'x',
          enabled: true,
          role: 'user',
          position: { type: 'relative' },
        },
      ],
      shortcuts: [{ label: 'r', insert: 'r' }],
      themeSettings: { ...baseTheme, mode: 'light' },
      currentFolder: '默认',
      activeTab: 'tab-insert',
    });
    const result = applyPmJsonImport(imported, 'replace', current);
    expect(result.memo[0].id).toBe('m2');
    expect(result.folders).toEqual(['默认']);
    expect(result.activeTab).toBe('tab-insert');
  });
});
