import {
  extractMemoArray,
  parseMemoEntryRaw,
  type MemoEntry,
  type PmTabId,
  type Shortcut,
  DEFAULT_SHORTCUTS,
  ShortcutSchema,
} from '../schema';
import {
  getDefaultPmThemeTokens,
  migrateLegacyColorScheme,
  PM_DEFAULT_DARK,
  PM_DEFAULT_LIGHT,
  defaultPmTavernManualColors,
  type PmTavernManualColors,
  type PmThemeMode,
  type PmThemePreset,
  type PmThemeSettings,
  type PmThemeTokens,
} from '../theme';

export type FolderMeta = { pinned?: boolean };

let scriptVarsCache: Record<string, unknown> | null = null;

export function invalidateScriptVarsCache() {
  scriptVarsCache = null;
}

function pmGlobalStorageKey(): string {
  try {
    const name = getScriptName();
    if (name) return `__preset_memo_v1__${name}`;
  } catch {
    /* ignore */
  }
  return '__preset_memo_v1__default';
}

function pmScriptIdCacheKey(): string {
  return `${pmGlobalStorageKey()}__script_ids`;
}

export function rememberScriptId(id: string) {
  if (!id) return;
  try {
    const global = getVariables({ type: 'global' }) ?? {};
    const prev = Array.isArray(global[pmScriptIdCacheKey()]) ? (global[pmScriptIdCacheKey()] as string[]) : [];
    const next = [id, ...prev.filter(x => x !== id)].slice(0, 12);
    insertOrAssignVariables({ [pmScriptIdCacheKey()]: next }, { type: 'global' });
  } catch (e) {
    console.warn('[预设备忘录] 缓存 script_id 失败', e);
  }
}

function getKnownScriptIds(): string[] {
  const ids: string[] = [];
  const push = (id: unknown) => {
    if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
  };
  try {
    push(getScriptId());
  } catch {
    /* ignore */
  }
  try {
    const global = getVariables({ type: 'global' }) ?? {};
    const cached = global[pmScriptIdCacheKey()];
    if (Array.isArray(cached)) cached.forEach(push);
  } catch {
    /* ignore */
  }
  try {
    Object.keys(getAllEnabledScriptButtons()).forEach(push);
  } catch {
    /* ignore */
  }
  let scriptName = '';
  try {
    scriptName = getScriptName();
  } catch {
    /* ignore */
  }
  if (scriptName) {
    for (const scope of ['global', 'preset', 'character'] as const) {
      try {
        collectScriptIdsFromTrees(getScriptTrees({ type: scope }), scriptName).forEach(push);
      } catch {
        /* ignore */
      }
    }
  }
  return ids;
}

function collectScriptIdsFromTrees(trees: ScriptTree[], scriptName: string): string[] {
  const ids: string[] = [];
  const walk = (nodes: ScriptTree[]) => {
    for (const node of nodes) {
      if (node.type === 'script') {
        if (node.name === scriptName) ids.push(node.id);
      } else {
        for (const s of node.scripts ?? []) {
          if (s.name === scriptName) ids.push(s.id);
        }
      }
    }
  };
  walk(trees);
  return ids;
}

/** 仅用于当前脚本尚无 memo 时的恢复合并，优先保留条目更多的快照。 */
function mergeScriptVarSnapshot(merged: Record<string, unknown>, src: Record<string, unknown> | null | undefined) {
  if (!src || typeof src !== 'object') return;
  const srcMemo = extractMemoArray(src);
  const mergedMemo = extractMemoArray(merged);
  if (!('memo' in merged)) {
    if ('memo' in src) merged.memo = src.memo;
  } else if (srcMemo.length > mergedMemo.length) {
    merged.memo = src.memo ?? srcMemo;
  }
  for (const [k, v] of Object.entries(src)) {
    if (k === 'memo') continue;
    if (merged[k] === undefined) merged[k] = v;
  }
}

function readCurrentScriptVars(): Record<string, unknown> {
  try {
    const id = getScriptId();
    if (id) {
      const vars = getVariables({ type: 'script', script_id: id });
      if (vars && typeof vars === 'object') return vars;
    }
  } catch {
    /* ignore */
  }
  try {
    const vars = getVariables({ type: 'script' });
    if (vars && typeof vars === 'object') return vars;
  } catch {
    /* ignore */
  }
  return {};
}

function readScriptDataFromTrees(): Record<string, unknown> {
  let scriptName = '';
  try {
    scriptName = getScriptName();
  } catch {
    return {};
  }
  if (!scriptName) return {};

  const merged: Record<string, unknown> = {};
  for (const scope of ['global', 'preset', 'character'] as const) {
    try {
      const trees = getScriptTrees({ type: scope });
      const walk = (nodes: ScriptTree[]) => {
        for (const node of nodes) {
          if (node.type === 'script') {
            if (node.name === scriptName && node.data && typeof node.data === 'object') {
              mergeScriptVarSnapshot(merged, node.data as Record<string, unknown>);
            }
          } else {
            for (const s of node.scripts ?? []) {
              if (s.name === scriptName && s.data && typeof s.data === 'object') {
                mergeScriptVarSnapshot(merged, s.data as Record<string, unknown>);
              }
            }
          }
        }
      };
      walk(trees);
    } catch {
      /* ignore */
    }
  }
  return merged;
}

export function readScriptVarsRaw(): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const tryMerge = (src: Record<string, unknown> | null | undefined) => mergeScriptVarSnapshot(merged, src);

  for (const id of getKnownScriptIds()) {
    try {
      tryMerge(getVariables({ type: 'script', script_id: id }) ?? {});
    } catch {
      /* ignore */
    }
  }
  try {
    tryMerge(getVariables({ type: 'script' }) ?? {});
  } catch {
    /* ignore */
  }
  tryMerge(readScriptDataFromTrees());
  tryMerge(readGlobalBackup() ?? undefined);
  for (const backup of readAllGlobalMemoBackups()) {
    tryMerge(backup);
  }
  return merged;
}

function readAllGlobalMemoBackups(): Record<string, unknown>[] {
  try {
    const global = getVariables({ type: 'global' }) ?? {};
    return Object.entries(global)
      .filter(([k]) => k.startsWith('__preset_memo_v1__') && !k.endsWith('__script_ids'))
      .map(([, v]) => v)
      .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
  } catch {
    return [];
  }
}

function readGlobalBackup(): Record<string, unknown> | null {
  try {
    const global = getVariables({ type: 'global' }) ?? {};
    const backup = global[pmGlobalStorageKey()];
    return backup && typeof backup === 'object' ? (backup as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function syncGlobalBackup(vars: Record<string, unknown>) {
  try {
    const existing = readGlobalBackup();
    const payload: Record<string, unknown> = {
      folders: vars.folders ?? existing?.folders,
      folderMeta: vars.folderMeta ?? existing?.folderMeta,
      pmUiState: vars.pmUiState ?? existing?.pmUiState,
      pmThemeSettings: vars.pmThemeSettings ?? existing?.pmThemeSettings,
    };
    if (vars.memo !== undefined) {
      payload.memo = vars.memo;
    } else if (existing?.memo !== undefined) {
      payload.memo = existing.memo;
    }
    insertOrAssignVariables({ [pmGlobalStorageKey()]: payload }, { type: 'global' });
  } catch (e) {
    console.warn('[预设备忘录] 写入全局备份失败', e);
  }
}

export function readScriptVars(): Record<string, unknown> {
  if (scriptVarsCache) return scriptVarsCache;

  const current = readCurrentScriptVars();
  // 当前脚本变量一旦存在 memo 字段（含空数组），即视为权威数据，不再从备份回填已删条目。
  if ('memo' in current) {
    scriptVarsCache = current;
    return current;
  }

  const scriptVars = readScriptVarsRaw();
  const backup = readGlobalBackup();
  const scriptMemoLen = extractMemoArray(scriptVars).length;
  const backupMemoLen = backup ? extractMemoArray(backup).length : 0;

  let restored = scriptVars;
  if (backup && backupMemoLen > scriptMemoLen) {
    console.warn(`[预设备忘录] 从全局备份恢复 memo (${backupMemoLen} 条, 合并结果 ${scriptMemoLen} 条)`);
    restored = {
      ...scriptVars,
      memo: backup.memo,
      folders: scriptVars.folders ?? backup.folders,
      folderMeta: scriptVars.folderMeta ?? backup.folderMeta,
      pmUiState: scriptVars.pmUiState ?? backup.pmUiState,
      pmThemeSettings: scriptVars.pmThemeSettings ?? backup.pmThemeSettings,
    };
  }

  if (extractMemoArray(restored).length > 0) {
    try {
      writeScriptVars({
        memo: restored.memo,
        folders: restored.folders,
        folderMeta: restored.folderMeta,
        pmUiState: restored.pmUiState,
        pmThemeSettings: restored.pmThemeSettings,
      });
    } catch (e) {
      console.warn('[预设备忘录] memo 迁移失败', e);
    }
  }

  scriptVarsCache = restored;
  return restored;
}

export function writeScriptVars(patch: Record<string, unknown>) {
  invalidateScriptVarsCache();
  let scriptId = '';
  try {
    scriptId = getScriptId();
  } catch {
    /* ignore */
  }
  if (scriptId) rememberScriptId(scriptId);
  const merged = { ...readCurrentScriptVars(), ...patch };
  if (scriptId) {
    insertOrAssignVariables(merged, { type: 'script', script_id: scriptId });
  } else {
    insertOrAssignVariables(merged, { type: 'script' });
  }
  syncGlobalBackup(merged);
}

export function getMemoData(): MemoEntry[] {
  const rawMemo = extractMemoArray(readScriptVars());
  if (rawMemo.length === 0) return [];
  const result: MemoEntry[] = [];
  for (const item of rawMemo) {
    const entry = parseMemoEntryRaw(item);
    if (entry) result.push(entry);
  }
  if (rawMemo.length > 0 && result.length === 0) {
    console.error('[预设备忘录] memo 数据存在但全部解析失败, 条目数:', rawMemo.length, rawMemo[0]);
  }
  return result;
}

export function saveMemoData(memo: MemoEntry[]) {
  writeScriptVars({ memo });
}

export function getFolders(): string[] {
  const folders = [...((readScriptVars().folders as string[] | undefined) || [])];
  if (!folders.includes('默认')) folders.unshift('默认');
  return folders;
}

export function saveFolders(folders: string[]) {
  writeScriptVars({ folders });
}

export function getFolderMeta(): Record<string, FolderMeta> {
  const raw = readScriptVars().folderMeta;
  return raw && typeof raw === 'object' ? (raw as Record<string, FolderMeta>) : {};
}

export function saveFolderMeta(meta: Record<string, FolderMeta>) {
  writeScriptVars({ folderMeta: meta });
}

function parsePmThemeTokens(raw: unknown, mode: PmThemeMode): PmThemeTokens {
  if (!raw || typeof raw !== 'object') return getDefaultPmThemeTokens(mode);
  return migrateLegacyColorScheme(raw as Record<string, unknown>, mode);
}

function parsePmTavernManualColors(raw: unknown, mode: PmThemeMode): PmTavernManualColors {
  const fallback = defaultPmTavernManualColors(mode);
  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;
  const pick = (key: keyof PmTavernManualColors) => {
    const v = o[key];
    return typeof v === 'string' && v.trim() ? v.trim() : fallback[key];
  };
  return {
    success: pick('success'),
    warning: pick('warning'),
    warningBg: pick('warningBg'),
    warningText: pick('warningText'),
    danger: pick('danger'),
  };
}

function parsePmTavernManual(raw: unknown): Record<PmThemeMode, PmTavernManualColors> {
  if (!raw || typeof raw !== 'object') {
    return {
      dark: defaultPmTavernManualColors('dark'),
      light: defaultPmTavernManualColors('light'),
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    dark: parsePmTavernManualColors(o.dark, 'dark'),
    light: parsePmTavernManualColors(o.light, 'light'),
  };
}

function parsePmThemeSettings(raw: unknown): PmThemeSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const mode: PmThemeMode = o.mode === 'light' ? 'light' : 'dark';
  const customPresets: PmThemePreset[] = [];
  if (Array.isArray(o.customPresets)) {
    o.customPresets.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const p = item as Record<string, unknown>;
      if (typeof p.id !== 'string') return;
      customPresets.push({
        id: p.id,
        label: typeof p.label === 'string' ? p.label : undefined,
        dark: parsePmThemeTokens(p.dark, 'dark'),
        light: parsePmThemeTokens(p.light, 'light'),
      });
    });
  }
  return {
    mode,
    style: o.style === 'tavern' ? 'tavern' : 'custom',
    dark: parsePmThemeTokens(o.dark, 'dark'),
    light: parsePmThemeTokens(o.light, 'light'),
    customPresets,
    tavernManual: parsePmTavernManual(o.tavernManual),
  };
}

function defaultPmThemeSettings(): PmThemeSettings {
  return {
    mode: 'dark',
    style: 'custom',
    dark: { ...PM_DEFAULT_DARK },
    light: { ...PM_DEFAULT_LIGHT },
    customPresets: [],
    tavernManual: {
      dark: defaultPmTavernManualColors('dark'),
      light: defaultPmTavernManualColors('light'),
    },
  };
}

export function loadPmThemeSettings(): PmThemeSettings {
  const vars = readScriptVars();
  const parsed = parsePmThemeSettings(vars.pmThemeSettings);
  if (parsed) return parsed;
  const legacy = localStorage.getItem('preset-memo-theme');
  const base = defaultPmThemeSettings();
  base.mode = legacy === 'light' ? 'light' : 'dark';
  return base;
}

export function savePmThemeSettings(settings: PmThemeSettings) {
  writeScriptVars({ pmThemeSettings: settings });
  localStorage.removeItem('preset-memo-theme');
}

export function getShortcuts(): Shortcut[] {
  const raw = readScriptVars().shortcuts;
  if (!Array.isArray(raw)) return [...DEFAULT_SHORTCUTS];
  const result: Shortcut[] = [];
  for (const item of raw) {
    const parsed = ShortcutSchema.safeParse(item);
    if (parsed.success) result.push(parsed.data);
  }
  return result.length > 0 ? result : [...DEFAULT_SHORTCUTS];
}

export function saveShortcuts(shortcuts: Shortcut[]) {
  writeScriptVars({ shortcuts });
}

const PM_TAB_IDS: PmTabId[] = [
  'tab-memo',
  'tab-import',
  'tab-import-preset',
  'tab-insert',
  'tab-export-wb',
];

function readPmUiState(): {
  currentFolder?: string;
  activeTab?: PmTabId;
  foldersBarOpen?: boolean;
  memoToolbarOpen?: boolean;
} {
  const raw = readScriptVars().pmUiState;
  if (!raw || typeof raw !== 'object') return {};
  return raw as {
    currentFolder?: string;
    activeTab?: PmTabId;
    foldersBarOpen?: boolean;
    memoToolbarOpen?: boolean;
  };
}

export function loadFoldersBarOpen(fallback = true): boolean {
  const state = readPmUiState();
  if (typeof state.foldersBarOpen === 'boolean') return state.foldersBarOpen;
  return fallback;
}

export function saveFoldersBarOpen(open: boolean) {
  const vars = readCurrentScriptVars();
  writeScriptVars({
    pmUiState: { ...(vars.pmUiState as object | undefined), foldersBarOpen: open },
  });
}

export function loadMemoToolbarOpen(fallback = true): boolean {
  const state = readPmUiState();
  if (typeof state.memoToolbarOpen === 'boolean') return state.memoToolbarOpen;
  return fallback;
}

export function saveMemoToolbarOpen(open: boolean) {
  const vars = readCurrentScriptVars();
  writeScriptVars({
    pmUiState: { ...(vars.pmUiState as object | undefined), memoToolbarOpen: open },
  });
}

export function loadCurrentFolder(): string {
  const state = readPmUiState();
  const folders = getFolders();
  if (state.currentFolder && folders.includes(state.currentFolder)) return state.currentFolder;
  return '默认';
}

export function loadActiveTab(): PmTabId {
  const state = readPmUiState();
  if (state.activeTab && PM_TAB_IDS.includes(state.activeTab)) return state.activeTab;
  return 'tab-memo';
}

export function saveCurrentFolder(currentFolder: string) {
  const vars = readCurrentScriptVars();
  writeScriptVars({
    pmUiState: { ...(vars.pmUiState as object | undefined), currentFolder },
  });
}

export function saveActiveTab(activeTab: PmTabId) {
  const vars = readCurrentScriptVars();
  writeScriptVars({
    pmUiState: { ...(vars.pmUiState as object | undefined), activeTab },
  });
}

export function ensureMemoFolderVisible(memo: MemoEntry[], currentFolder: string): string {
  if (memo.length === 0) return currentFolder;
  const folders = getFolders();
  let folder = folders.includes(currentFolder) ? currentFolder : folders.includes('默认') ? '默认' : folders[0]!;
  const inCurrent = memo.filter(e => (e.folder || '默认') === folder).length;
  if (inCurrent > 0) return folder;
  const counts = new Map<string, number>();
  memo.forEach(e => {
    const f = e.folder || '默认';
    counts.set(f, (counts.get(f) || 0) + 1);
  });
  let bestFolder = folder;
  let bestCount = 0;
  counts.forEach((n, f) => {
    if (n > bestCount) {
      bestCount = n;
      bestFolder = f;
    }
  });
  return bestCount > 0 ? bestFolder : folder;
}
