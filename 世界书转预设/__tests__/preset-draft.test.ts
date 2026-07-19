import { describe, expect, it } from 'vitest';
import { getInsertDraftSaveSummary } from '../lib/preset-draft';

describe('preset-draft save summary', () => {
  it('lists added deleted and enabled changes', () => {
    const baselineIds = new Set(['id1']);
    const baselineNames = new Set(['old name']);
    const baselineEnabled = new Map<string, boolean>([['id1', true]]);
    const drafts = [
      { id: 'id1', name: 'old name', content: 'c', enabled: false, role: 'system' as const, position: { type: 'relative' as const } },
      { id: 'id2', name: 'new', content: 'n', enabled: true, role: 'system' as const, position: { type: 'relative' as const } },
      { id: 'id3', name: 'gone', content: 'x', enabled: true, role: 'system' as const, position: { type: 'relative' as const }, __pendingDelete: true },
    ];
    const summary = getInsertDraftSaveSummary(drafts, baselineIds, baselineNames, baselineEnabled);
    expect(summary.added.some(a => a.name === 'new')).toBe(true);
    expect(summary.deleted).toContain('gone');
    expect(summary.disabled).toContain('old name');
  });
});
