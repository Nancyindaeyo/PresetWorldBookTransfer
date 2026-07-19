import type { PresetVarLintEntry } from '../var-lint';
import { getDraftDisplayName, type PresetPromptDraft } from './preset-draft';

export function buildInsertDraftVarLintEntries(
  prompts: PresetPromptDraft[],
  liveIndex: number,
  liveContent: string,
): PresetVarLintEntry[] {
  return prompts.map((p, index) => ({
    index,
    name: getDraftDisplayName(p),
    content: index === liveIndex ? liveContent : p.content || '',
    enabled: p.enabled ?? true,
    pendingDelete: !!p.__pendingDelete,
  }));
}

export function buildExportPresetVarLintEntries(liveIndex: number, liveContent: string): PresetVarLintEntry[] {
  const preset = getPreset('in_use');
  return (preset.prompts || []).map((p: Record<string, unknown>, index: number) => ({
    index,
    name: String(p.name || p.id || '未命名条目'),
    content: index === liveIndex ? liveContent : String(p.content || ''),
    enabled: (p.enabled as boolean) ?? true,
    pendingDelete: false,
  }));
}
