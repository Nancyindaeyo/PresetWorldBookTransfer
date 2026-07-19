import { describe, expect, it } from 'vitest';
import {
  buildPresetMemoMigrationMessage,
  isPresetMemoLegacyScriptName,
  mergePresetMemoVarSnapshots,
} from '../lib/script-var-migrate';
import type { MemoEntry } from '../schema';

const entry = (id: string, name: string, content: string, folder = '默认'): MemoEntry => ({
  id,
  name,
  content,
  enabled: true,
  role: 'system',
  position: { type: 'relative' },
  folder,
});

describe('script-var-migrate', () => {
  it('merges memo entries by id and keeps richer content', () => {
    const merged = mergePresetMemoVarSnapshots([
      { memo: [entry('a', '旧名', 'short')] },
      { memo: [entry('a', '新名', 'longer content'), entry('b', 'B', 'only in new')] },
    ]);
    expect(merged.memo).toHaveLength(2);
    const a = (merged.memo as MemoEntry[]).find(m => m.id === 'a');
    expect(a?.content).toBe('longer content');
  });

  it('unions folders and keeps 默认', () => {
    const merged = mergePresetMemoVarSnapshots([
      { folders: ['默认', '文风'] },
      { folders: ['角色'] },
    ]);
    expect(merged.folders).toEqual(expect.arrayContaining(['默认', '文风', '角色']));
  });

  it('prefers first non-empty ui/theme/shortcuts', () => {
    const merged = mergePresetMemoVarSnapshots([
      { pmUiState: { activeTab: 'tab-memo' }, shortcuts: [{ label: 'a', insert: 'b' }] },
      { pmUiState: { activeTab: 'tab-insert' }, pmThemeSettings: { mode: 'dark' } },
    ]);
    expect(merged.pmUiState).toEqual({ activeTab: 'tab-memo' });
    expect(merged.pmThemeSettings).toEqual({ mode: 'dark' });
    expect(merged.shortcuts).toEqual([{ label: 'a', insert: 'b' }]);
  });

  it('recognizes legacy script names', () => {
    expect(isPresetMemoLegacyScriptName('预设世界书互转备忘录 6.4.1 (Auto-update)')).toBe(true);
    expect(isPresetMemoLegacyScriptName('预设/世界书互转备忘录 (Code version)')).toBe(true);
    expect(isPresetMemoLegacyScriptName('预设备忘录')).toBe(true);
    expect(isPresetMemoLegacyScriptName('世界书管理器2.5')).toBe(false);
  });

  it('builds migration confirm message', () => {
    const msg = buildPresetMemoMigrationMessage({
      isCanonicalInstance: true,
      canonical: {
        id: 'preset-worldbook-transfer',
        name: '预设备忘录',
        scope: 'global',
        enabled: true,
        content: '',
      },
      legacyScripts: [
        {
          id: 'old',
          name: '预设世界书互转备忘录 6.4.1',
          scope: 'global',
          enabled: true,
          content: '',
        },
      ],
      duplicateCount: 2,
      mergedMemoCount: 5,
      mergedFolderCount: 2,
    });
    expect(msg).toContain('5 条备忘');
    expect(msg).toContain('预设世界书互转备忘录');
    expect(msg).toContain('刷新酒馆页面');
  });
});
