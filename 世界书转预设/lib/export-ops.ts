import {
  applyDraftFieldsToPartialEntry,
  buildTransferEntryFromDraft,
  draftFromMemo,
  draftFromPreset,
  draftFromWorldbookEntry,
  normalizeExportNameKey,
  type ExportWbDraft,
  type ExportWbSourceType,
} from '../export-wb';
import { getExportPresetSourceKey, removePresetEntriesForExport } from './preset-draft';
import { getMemoData, saveMemoData } from './script-vars';
import type { MemoEntry } from '../schema';

const WB_TRANSFER_RENDER = { render: 'immediate' as const };

export function buildExportDrafts(
  sourceType: ExportWbSourceType,
  opts: { exportMemoFolder: string; exportSourceWbName: string; exportWbEntriesCache: WorldbookEntry[] },
): ExportWbDraft[] {
  if (sourceType === 'preset') {
    const preset = getPreset('in_use');
    const prompts = preset.prompts || [];
    return prompts.map((prompt, index) =>
      draftFromPreset(prompt, getExportPresetSourceKey(prompt, index), index),
    );
  }
  if (sourceType === 'memo') {
    const memo = getMemoData().filter(e => (e.folder || '默认') === opts.exportMemoFolder);
    return memo.map(entry => draftFromMemo(entry));
  }
  if (!opts.exportSourceWbName || opts.exportWbEntriesCache.length === 0) return [];
  return opts.exportWbEntriesCache.map(entry => draftFromWorldbookEntry(entry));
}

export function applyExportBatchToDrafts(
  drafts: ExportWbDraft[],
  checkedKeys: Set<string>,
  batch: {
    strategy: string;
    position: string;
    order: string;
    depth: string;
    preventIn: boolean;
    preventOut: boolean;
  },
): number {
  const hasOrder = batch.order !== '' && batch.order != null;
  const hasDepth = batch.depth !== '' && batch.depth != null;
  const hasAny =
    batch.strategy ||
    batch.position ||
    hasOrder ||
    (batch.position === 'at_depth' && hasDepth) ||
    batch.preventIn ||
    batch.preventOut;
  if (!hasAny) return 0;

  let count = 0;
  drafts.forEach(draft => {
    if (!checkedKeys.has(draft.sourceKey)) return;
    if (batch.strategy === 'constant' || batch.strategy === 'selective') draft.strategyType = batch.strategy;
    if (batch.position) draft.positionType = batch.position as ExportWbDraft['positionType'];
    if (hasOrder) draft.positionOrder = Number(batch.order) || 0;
    if (batch.position === 'at_depth' && hasDepth) draft.positionDepth = Number(batch.depth) || 0;
    if (batch.preventIn) draft.preventIncoming = true;
    if (batch.preventOut) draft.preventOutgoing = true;
    count++;
  });
  return count;
}

export async function executeExportTransfer(opts: {
  mode: 'copy' | 'move';
  targetWbName: string;
  sourceType: ExportWbSourceType;
  exportSourceWbName: string;
  drafts: ExportWbDraft[];
  skipDuplicateCheck?: boolean;
}): Promise<{ count: number; targetWbName: string }> {
  const { mode, targetWbName, sourceType, exportSourceWbName, drafts } = opts;
  if (!targetWbName.trim()) throw new Error('NO_TARGET');
  if (sourceType === 'worldbook') {
    if (!exportSourceWbName) throw new Error('NO_SOURCE_WB');
    if (mode === 'move' && exportSourceWbName === targetWbName) throw new Error('SAME_SOURCE_TARGET');
  }
  if (drafts.length === 0) throw new Error('NO_DRAFTS');

  const wbNames = getWorldbookNames();
  let existingNames = new Set<string>();
  if (wbNames.includes(targetWbName)) {
    const existing = await getWorldbook(targetWbName);
    existingNames = new Set(existing.map(e => normalizeExportNameKey(e.name ?? '')));
  }

  const duplicateNames = [
    ...new Set(
      drafts
        .map(d => d.name.trim() || '未命名条目')
        .filter(name => existingNames.has(normalizeExportNameKey(name))),
    ),
  ];
  if (!opts.skipDuplicateCheck && duplicateNames.length > 0) {
    throw new Error('DUPLICATE_NAMES:' + duplicateNames.join('\n'));
  }

  if (!wbNames.includes(targetWbName)) {
    await createWorldbook(targetWbName);
  }

  let newEntries: ReturnType<typeof buildTransferEntryFromDraft>[];
  if (sourceType === 'worldbook' && exportSourceWbName) {
    const sourceWb = await getWorldbook(exportSourceWbName);
    const byUid = new Map(sourceWb.map(e => [e.uid, e]));
    newEntries = drafts.map(draft => {
      const uid = Number.parseInt(draft.sourceKey, 10);
      const sourceEntry = Number.isNaN(uid) ? undefined : byUid.get(uid);
      if (!sourceEntry) {
        console.warn('[导出世界书] 源条目 uid 未找到，回退为草稿:', draft.sourceKey, draft.name);
      }
      return buildTransferEntryFromDraft(draft, sourceEntry);
    });
  } else {
    newEntries = drafts.map(d => applyDraftFieldsToPartialEntry(d));
  }

  const { new_entries: createdEntries } = await createWorldbookEntries(targetWbName, newEntries, WB_TRANSFER_RENDER);
  if (createdEntries.length === 0 && newEntries.length > 0) {
    throw new Error('createWorldbookEntries 未返回任何新条目');
  }

  if (mode === 'move') {
    if (sourceType === 'worldbook') {
      const uids = new Set(drafts.map(d => Number.parseInt(d.sourceKey, 10)).filter(n => !Number.isNaN(n)));
      await deleteWorldbookEntries(exportSourceWbName, e => uids.has(e.uid), WB_TRANSFER_RENDER);
    } else if (sourceType === 'memo') {
      const idSet = new Set(drafts.map(d => d.sourceKey));
      const memo = getMemoData().filter(e => !idSet.has(e.id));
      saveMemoData(memo);
    } else {
      await removePresetEntriesForExport(drafts.map(d => d.sourceKey));
    }
  }

  return { count: drafts.length, targetWbName };
}

export function wbEntryToImportInput(entry: WorldbookEntry): { name: string; content: string; role: 'system' } {
  return {
    name: entry.name || '未命名条目',
    content: entry.content || '',
    role: 'system',
  };
}

export function presetEntryToImportInput(entry: Record<string, unknown>): {
  name: string;
  content: string;
  role: 'system' | 'user' | 'assistant';
} {
  return {
    name: String(entry.name || entry.id || '未命名条目'),
    content: String(entry.content || ''),
    role: (entry.role === 'user' || entry.role === 'assistant' ? entry.role : 'system') as
      | 'system'
      | 'user'
      | 'assistant',
  };
}
