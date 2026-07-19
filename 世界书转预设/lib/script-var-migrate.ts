import { extractMemoArray, parseMemoEntryRaw, type MemoEntry } from '../schema';
import { invalidateScriptVarsCache, syncGlobalBackup } from './script-vars';

export const PM_SCRIPT_CANONICAL_ID = 'preset-worldbook-transfer';
export const PM_SCRIPT_CANONICAL_NAME = '预设备忘录';

/** 旧版脚本常见名称片段（如「预设世界书互转备忘录 6.4.1 (Auto-update)」） */
export const PM_LEGACY_NAME_MARKERS = [
  PM_SCRIPT_CANONICAL_NAME,
  '预设世界书互转备忘录',
  '预设/世界书互转备忘录',
  '世界书互转备忘录',
  '世界书转预设',
];

const PM_CONTENT_MARKERS = [
  'PresetWorldBookTransfer',
  'preset-memo-vue-root',
  'preset-memo-modal',
  '世界书转预设',
  '预设备忘录',
];

const PM_MIGRATION_DONE_KEY = 'pmLegacyMigrationDone';

export type PresetMemoScriptRef = {
  id: string;
  name: string;
  scope: ScriptTreesOptions['type'];
  enabled: boolean;
  content: string;
};

export type PresetMemoMigrationPlan = {
  isCanonicalInstance: boolean;
  canonical: PresetMemoScriptRef;
  legacyScripts: PresetMemoScriptRef[];
  duplicateCount: number;
  mergedMemoCount: number;
  mergedFolderCount: number;
};

export type ScriptConsolidationResult = {
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

/** 识别旧版「预设世界书互转备忘录 …」等脚本名。 */
export function isPresetMemoLegacyScriptName(name: string): boolean {
  const text = name.trim();
  if (!text) return false;
  return PM_LEGACY_NAME_MARKERS.some(marker => text.includes(marker));
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
  if (isPresetMemoLegacyScriptName(node.name)) return true;
  if (isPresetMemoScriptContent(node.content ?? '')) return true;
  return hasPresetMemoData(node.data as Record<string, unknown> | undefined);
}

function walkScriptTrees(
  trees: ScriptTree[],
  visit: (script: Script, scope: ScriptTreesOptions['type']) => void,
  scope: ScriptTreesOptions['type'],
) {
  for (const node of trees) {
    if (node.type === 'script') {
      visit(node, scope);
      continue;
    }
    for (const script of node.scripts ?? []) visit(script, scope);
  }
}

export function collectPresetMemoScripts(options?: { enabledOnly?: boolean }): PresetMemoScriptRef[] {
  const enabledOnly = options?.enabledOnly !== false;
  const found = new Map<string, PresetMemoScriptRef>();
  for (const scope of ['global', 'preset', 'character'] as const) {
    try {
      walkScriptTrees(
        getScriptTrees({ type: scope }),
        script => {
          if (enabledOnly && !script.enabled) return;
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

function buildMergedSnapshot(scripts: PresetMemoScriptRef[]): Record<string, unknown> {
  return mergePresetMemoVarSnapshots(scripts.map(readMergedSourceForRef));
}

export function buildPresetMemoMigrationMessage(plan: PresetMemoMigrationPlan): string {
  const legacyNames = plan.legacyScripts.map(s => `「${s.name}」`).join('、');
  return (
    `检测到 ${plan.duplicateCount} 个预设备忘录脚本（含旧版：${legacyNames}）。\n\n` +
    `将把旧脚本的数据合并到当前扩展版本（约 ${plan.mergedMemoCount} 条备忘、` +
    `${plan.mergedFolderCount} 个文件夹），并自动关闭这些旧脚本（含「预设世界书互转备忘录 …」等）。\n\n` +
    `合并完成后将刷新酒馆页面。是否继续？`
  );
}

function readMigrationDone(canonicalId: string): boolean {
  try {
    const vars = getVariables({ type: 'script', script_id: canonicalId });
    if (!vars || typeof vars !== 'object') return false;
    return (vars as Record<string, unknown>)[PM_MIGRATION_DONE_KEY] === true;
  } catch {
    return false;
  }
}

function markMigrationDone(canonicalId: string) {
  insertOrAssignVariables({ [PM_MIGRATION_DONE_KEY]: true }, { type: 'script', script_id: canonicalId });
}

function collectLegacyScriptIds(canonicalId: string, options?: { enabledOnly?: boolean }): string[] {
  return collectPresetMemoScripts(options)
    .filter(script => script.id !== canonicalId)
    .map(script => script.id);
}

/** 静默关闭仍启用的旧版重复脚本（迁移后刷新时的兜底）。 */
export function suppressEnabledLegacyPresetMemoScripts(canonicalScriptId: string): string[] {
  const disableIds = collectLegacyScriptIds(canonicalScriptId, { enabledOnly: true });
  if (disableIds.length === 0) return [];
  disableDuplicateScripts(new Set(disableIds));
  return disableIds;
}

/** 当前实例是否应挂载 UI；非 canonical 的重复实例应跳过。 */
export function resolvePresetMemoScriptInstance(): { shouldRun: boolean; canonicalScriptId: string | null } {
  let currentId = '';
  try {
    currentId = getScriptId();
  } catch {
    return { shouldRun: true, canonicalScriptId: null };
  }

  const scripts = collectPresetMemoScripts();
  if (scripts.length <= 1) {
    return { shouldRun: true, canonicalScriptId: scripts[0]?.id ?? currentId };
  }

  const canonical = pickCanonicalScript(scripts);
  return {
    shouldRun: currentId === canonical.id,
    canonicalScriptId: canonical.id,
  };
}

/** 若存在可迁移的重复脚本且当前为 canonical 实例，返回迁移计划。 */
export function getPresetMemoDuplicateMigrationPlan(): PresetMemoMigrationPlan | null {
  let currentId = '';
  try {
    currentId = getScriptId();
  } catch {
    return null;
  }

  const scripts = collectPresetMemoScripts();
  if (scripts.length <= 1) return null;

  const canonical = pickCanonicalScript(scripts);
  if (currentId !== canonical.id) return null;
  if (readMigrationDone(canonical.id)) return null;

  const legacyScripts = scripts.filter(s => s.id !== canonical.id);
  if (legacyScripts.length === 0) return null;

  const merged = buildMergedSnapshot([canonical, ...legacyScripts]);
  const folders = Array.isArray(merged.folders) ? (merged.folders as string[]) : [];

  return {
    isCanonicalInstance: true,
    canonical,
    legacyScripts,
    duplicateCount: 1 + legacyScripts.length,
    mergedMemoCount: extractMemoArray(merged).length,
    mergedFolderCount: folders.length,
  };
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

/** 执行迁移：合并数据到 canonical 脚本并禁用其余重复脚本。 */
export function executePresetMemoScriptMigration(plan: PresetMemoMigrationPlan): ScriptConsolidationResult {
  const { canonical, legacyScripts } = plan;
  const merged = buildMergedSnapshot([canonical, ...legacyScripts]);
  const mergedMemoCount = extractMemoArray(merged).length;

  try {
    insertOrAssignVariables(merged, { type: 'script', script_id: canonical.id });
    syncGlobalBackup(merged);
    invalidateScriptVarsCache();
  } catch (e) {
    console.warn('[预设备忘录] 合并重复脚本数据失败', e);
    return {
      migrated: false,
      canonicalScriptId: canonical.id,
      duplicateCount: plan.duplicateCount,
      disabledScriptIds: [],
      mergedMemoCount,
    };
  }

  const disableIds = new Set(collectLegacyScriptIds(canonical.id, { enabledOnly: false }));
  if (disableIds.size > 0) disableDuplicateScripts(disableIds);

  markMigrationDone(canonical.id);

  console.info('[预设备忘录] 脚本合并完成', {
    canonical: canonical.id,
    disabled: [...disableIds],
    mergedMemoCount,
  });

  return {
    migrated: true,
    canonicalScriptId: canonical.id,
    duplicateCount: plan.duplicateCount,
    disabledScriptIds: [...disableIds],
    mergedMemoCount,
  };
}
