import { extractMemoArray, parseMemoEntryRaw, type MemoEntry } from '../schema';
import { invalidateScriptVarsCache, syncGlobalBackup } from './script-vars';

export const PM_SCRIPT_CANONICAL_ID = 'preset-worldbook-transfer';
export const PM_SCRIPT_CANONICAL_NAME = '预设备忘录';

const PM_CONTENT_MARKERS = [
  'PresetWorldBookTransfer',
  'preset-memo-vue-root',
  'preset-memo-modal',
  '世界书转预设',
  '预设备忘录',
];

export type PresetMemoScriptRef = {
  id: string;
  name: string;
  scope: ScriptTreesOptions['type'];
  enabled: boolean;
  content: string;
};

export type ScriptConsolidationResult = {
  /** 当前脚本实例是否应继续挂载 UI */
  shouldRun: boolean;
  migrated: boolean;
  canonicalScriptId: string | null;
  duplicateCount: number;
  disabledScriptIds: string[];
  mergedMemoCount: number;
};

function isPresetMemoScriptContent(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  return PM_CONTENT_MARKERS.some(marker => text.includes(marker));
}

function hasPresetMemoData(data: Record<string, unknown> | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  return (
    extractMemoArray(data).length > 0 ||
    Array.isArray(data.folders) ||
    data.pmUiState != null ||
    data.pmThemeSettings != null ||
    data.shortcuts != null
  );
}

function isPresetMemoScriptNode(node: ScriptTree): node is Script & { type: 'script' } {
  if (node.type !== 'script') return false;
  if (node.id === PM_SCRIPT_CANONICAL_ID) return true;
  if (node.name === PM_SCRIPT_CANONICAL_NAME) return true;
  if (isPresetMemoScriptContent(node.content ?? '')) return true;
  return hasPresetMemoData(node.data as Record<string, unknown> | undefined);
}

function walkScriptTrees(trees: ScriptTree[], visit: (script: Script, scope: ScriptTreesOptions['type']) => void, scope: ScriptTreesOptions['type']) {
  for (const node of trees) {
    if (node.type === 'script') {
      visit(node, scope);
      continue;
    }
    for (const script of node.scripts ?? []) visit(script, scope);
  }
}

export function collectPresetMemoScripts(): PresetMemoScriptRef[] {
  const found = new Map<string, PresetMemoScriptRef>();
  for (const scope of ['global', 'preset', 'character'] as const) {
    try {
      walkScriptTrees(
        getScriptTrees({ type: scope }),
        script => {
          if (!isPresetMemoScriptNode(script)) return;
          if (found.has(script.id)) return;
          found.set(script.id, {
            id: script.id,
            name: script.name,
            scope,
            enabled: script.enabled,
            content: script.content ?? '',
          });
        },
        scope,
      );
    } catch {
      /* ignore */
    }
  }
  return [...found.values()];
}

function readScriptVarsById(scriptId: string): Record<string, unknown> {
  try {
    const vars = getVariables({ type: 'script', script_id: scriptId });
    if (vars && typeof vars === 'object') return vars as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

function readScriptDataFromTree(ref: PresetMemoScriptRef): Record<string, unknown> {
  try {
    const trees = getScriptTrees({ type: ref.scope });
    let data: Record<string, unknown> = {};
    walkScriptTrees(
      trees,
      script => {
        if (script.id === ref.id && script.data && typeof script.data === 'object') {
          data = script.data as Record<string, unknown>;
        }
      },
      ref.scope,
    );
    return data;
  } catch {
    return {};
  }
}

function mergeMemoEntries(existing: MemoEntry[], incoming: MemoEntry[]): MemoEntry[] {
  const map = new Map<string, MemoEntry>();
  for (const entry of existing) map.set(entry.id, entry);
  for (const entry of incoming) {
    const prev = map.get(entry.id);
    if (!prev) {
      map.set(entry.id, entry);
      continue;
    }
    const keepIncoming =
      entry.content.length > prev.content.length ||
      (entry.content.length === prev.content.length && entry.name !== '未命名条目' && prev.name === '未命名条目');
    map.set(entry.id, keepIncoming ? entry : prev);
  }
  return [...map.values()];
}

function mergeStringArrays(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  const merged = [...new Set([...(a ?? []), ...(b ?? [])])];
  return merged.length > 0 ? merged : undefined;
}

function mergeFolderMeta(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const merged = { ...(a ?? {}), ...(b ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** 合并多个脚本变量快照，供重复脚本迁移与单元测试使用。 */
export function mergePresetMemoVarSnapshots(sources: Record<string, unknown>[]): Record<string, unknown> {
  let memo: MemoEntry[] = [];
  let folders: string[] | undefined;
  let folderMeta: Record<string, unknown> | undefined;
  let pmUiState: unknown;
  let pmThemeSettings: unknown;
  let shortcuts: unknown;

  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    const parsed: MemoEntry[] = [];
    for (const raw of extractMemoArray(src)) {
      const entry = parseMemoEntryRaw(raw);
      if (entry) parsed.push(entry);
    }
    memo = mergeMemoEntries(memo, parsed);
    folders = mergeStringArrays(folders, Array.isArray(src.folders) ? (src.folders as string[]) : undefined);
    folderMeta = mergeFolderMeta(folderMeta, src.folderMeta as Record<string, unknown> | undefined);
    if (src.pmUiState != null && pmUiState == null) pmUiState = src.pmUiState;
    if (src.pmThemeSettings != null && pmThemeSettings == null) pmThemeSettings = src.pmThemeSettings;
    if (src.shortcuts != null && shortcuts == null) shortcuts = src.shortcuts;
  }

  const merged: Record<string, unknown> = {};
  if (memo.length > 0) merged.memo = memo;
  if (folders?.length) merged.folders = folders.includes('默认') ? folders : ['默认', ...folders];
  if (folderMeta) merged.folderMeta = folderMeta;
  if (pmUiState != null) merged.pmUiState = pmUiState;
  if (pmThemeSettings != null) merged.pmThemeSettings = pmThemeSettings;
  if (shortcuts != null) merged.shortcuts = shortcuts;
  return merged;
}

function scoreCanonicalCandidate(ref: PresetMemoScriptRef, vars: Record<string, unknown>): number {
  let score = extractMemoArray(vars).length;
  if (ref.id === PM_SCRIPT_CANONICAL_ID) score += 100_000;
  if (ref.content.includes('/scripts/extensions/third-party/PresetWorldBookTransfer/')) score += 10_000;
  if (ref.name === PM_SCRIPT_CANONICAL_NAME) score += 1_000;
  if (ref.enabled) score += 100;
  return score;
}

function pickCanonicalScript(scripts: PresetMemoScriptRef[]): PresetMemoScriptRef {
  return scripts
    .map(ref => ({ ref, score: scoreCanonicalCandidate(ref, readMergedSourceForRef(ref)) }))
    .sort((a, b) => b.score - a.score)[0]!.ref;
}

function readMergedSourceForRef(ref: PresetMemoScriptRef): Record<string, unknown> {
  return mergePresetMemoVarSnapshots([readScriptDataFromTree(ref), readScriptVarsById(ref.id)]);
}

function disableScriptInTrees(trees: ScriptTree[], disableIds: Set<string>): ScriptTree[] {
  return trees.map(node => {
    if (node.type === 'script') {
      if (!disableIds.has(node.id)) return node;
      return { ...node, enabled: false };
    }
    return {
      ...node,
      scripts: (node.scripts ?? []).map(script =>
        disableIds.has(script.id) ? { ...script, enabled: false } : script,
      ),
    };
  });
}

function disableDuplicateScripts(disableIds: Set<string>) {
  for (const scope of ['global', 'preset', 'character'] as const) {
    try {
      updateScriptTreesWith(trees => disableScriptInTrees(trees, disableIds), { type: scope });
    } catch (e) {
      console.warn(`[预设备忘录] 禁用重复脚本失败 (${scope})`, e);
    }
  }
}

/**
 * 当存在多个预设备忘录脚本（旧的手动 import + 新的扩展注册）时：
 * - 合并全部数据到 canonical 脚本
 * - 禁用其余重复脚本，避免双开 UI
 * - 非 canonical 实例跳过 UI 挂载
 */
export function ensurePresetMemoScriptConsolidated(): ScriptConsolidationResult {
  const empty: ScriptConsolidationResult = {
    shouldRun: true,
    migrated: false,
    canonicalScriptId: null,
    duplicateCount: 0,
    disabledScriptIds: [],
    mergedMemoCount: 0,
  };

  let currentId = '';
  try {
    currentId = getScriptId();
  } catch {
    return empty;
  }

  const scripts = collectPresetMemoScripts();
  if (scripts.length <= 1) {
    return { ...empty, canonicalScriptId: scripts[0]?.id ?? currentId };
  }

  const canonical = pickCanonicalScript(scripts);
  const sources = scripts.map(readMergedSourceForRef);
  const merged = mergePresetMemoVarSnapshots(sources);
  const mergedMemoCount = extractMemoArray(merged).length;

  if (currentId !== canonical.id) {
    return {
      shouldRun: false,
      migrated: false,
      canonicalScriptId: canonical.id,
      duplicateCount: scripts.length,
      disabledScriptIds: [],
      mergedMemoCount,
    };
  }

  try {
    insertOrAssignVariables(merged, { type: 'script', script_id: canonical.id });
    syncGlobalBackup(merged);
    invalidateScriptVarsCache();
  } catch (e) {
    console.warn('[预设备忘录] 合并重复脚本数据失败', e);
    return {
      shouldRun: true,
      migrated: false,
      canonicalScriptId: canonical.id,
      duplicateCount: scripts.length,
      disabledScriptIds: [],
      mergedMemoCount,
    };
  }

  const disableIds = new Set(scripts.filter(s => s.id !== canonical.id && s.enabled).map(s => s.id));
  if (disableIds.size > 0) disableDuplicateScripts(disableIds);

  if (disableIds.size > 0 || mergedMemoCount > 0) {
    const msg =
      disableIds.size > 0
        ? `已合并 ${scripts.length - 1} 个旧脚本的数据（${mergedMemoCount} 条备忘），并自动关闭重复脚本。`
        : `已合并 ${scripts.length - 1} 个旧脚本的数据（${mergedMemoCount} 条备忘）。`;
    toastr.info(msg, PM_SCRIPT_CANONICAL_NAME);
    console.info('[预设备忘录] 脚本合并完成', {
      canonical: canonical.id,
      disabled: [...disableIds],
      mergedMemoCount,
    });
  }

  return {
    shouldRun: true,
    migrated: true,
    canonicalScriptId: canonical.id,
    duplicateCount: scripts.length,
    disabledScriptIds: [...disableIds],
    mergedMemoCount,
  };
}
