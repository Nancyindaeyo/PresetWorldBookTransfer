import { describe, expect, it } from 'vitest';
import {
  analyzePresetVarLint,
  extractGetvarCounts,
  extractSetvarCounts,
  scanMacroLintIssues,
} from '../var-lint';

describe('var-lint', () => {
  it('extracts setvar and getvar counts', () => {
    const content = '{{setvar::a::1}} {{getvar::a}} {{setvar::b::2}}';
    expect(extractSetvarCounts(content).get('a')).toBe(1);
    expect(extractGetvarCounts(content).get('a')).toBe(1);
  });

  it('reports missing getvar for setvar', () => {
    const entries = [
      { index: 0, name: 'A', content: '{{setvar::x::1}}', enabled: true },
      { index: 1, name: 'B', content: 'plain', enabled: true },
    ];
    const report = analyzePresetVarLint(entries, 0, entries[0].content);
    expect(report.items[0].macroKind).toBe('set');
    expect(report.items[0].status).toBe('missing');
  });

  it('detects unclosed braces and roll macro', () => {
    const issues = scanMacroLintIssues('{{setvar::a::1}} {{roll:1d20}} {{unclosed');
    expect(issues.some(i => i.kind === 'unclosed')).toBe(true);
    expect(issues.some(i => i.kind === 'roll')).toBe(true);
  });

  it('links getvar to prior setvar', () => {
    const entries = [
      { index: 0, name: 'Set', content: '{{setvar::v::ok}}', enabled: true },
      { index: 1, name: 'Get', content: '{{getvar::v}}', enabled: true },
    ];
    const report = analyzePresetVarLint(entries, 1, entries[1].content);
    const getItem = report.items.find(i => i.macroKind === 'get');
    expect(getItem?.status).toBe('ok');
    expect(getItem?.refs.length).toBe(1);
  });
});
