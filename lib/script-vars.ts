import {
  extractMemoArray,
  parseMemoEntryRaw,
  type MemoEntry,
  type Shortcut,
  DEFAULT_SHORTCUTS,
  ShortcutSchema,
} from '../schema';
import {
  getDefaultPmThemeTokens,
  migrateLegacyColorScheme,
  PM_DEFAULT_DARK,
  PM_DEFAULT_LIGHT,
  type PmThemeMode,
  type PmThemePreset,
  type PmThemeSettings,
  type PmThemeTokens,
} from '../theme';

export type FolderMeta = { pinned?: boolean };

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

function mergeScriptVarSnapshot(merged: Record<string, unknown>, src: Record<string, unknown> | null | undefined) {
  if (!src || typeof src !== 'object') return;
  const srcMemo = extractMemoArray(src);
  const mergedMemo = extractMemoArray(merged);
  if (srcMemo.length > mergedMemo.length) merged.memo = srcMemo;
  for (const [k, v] of Object.entries(src)) {
    if (k === 'memo') continue;
    if (merged[k] === undefined) merged[k] = v;
  }
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
    const incomingMemo = extractMemoArray(vars);
    const existingMemo = existing ? extractMemoArray(existing) : [];
    const payload: Record<string, unknown> = {
      folders: vars.folders ?? existing?.folders,
      folderMeta: vars.folderMeta ?? existing?.folderMeta,
      pmUiState: vars.pmUiState ?? existing?.pmUiState,
      pmThemeSettings: vars.pmThemeSettings ?? existing?.pmThemeSettings,
    };
    if (incomingMemo.length > 0) {
      payload.memo = vars.memo ?? incomingMemo;
    } else if (existingMemo.length > 0) {
      payload.memo = existing!.memo;
    } else if (vars.memo !== undefined) {
      payload.memo = vars.memo;
    }
    insertOrAssignVariables({ [pmGlobalStorageKey()]: payload }, { type: 'global' });
  } catch (e) {
    console.warn('[预设备忘录] 写入全局备份失败', e);
  }
}

export function readScriptVars(): Record<string, unknown> {
  const scriptVars = readScriptVarsRaw();
  const backup = readGlobalBackup();
  const scriptMemoLen = extractMemoArray(scriptVars).length;
  const backupMemoLen = backup ? extractMemoArray(backup).length : 0;
  const bestMemoLen = Math.max(scriptMemoLen, backupMemoLen);

  let restored = scriptVars;
  if (backup && backupMemoLen > scriptMemoLen) {
    console.warn(`[预设备忘录] 从全局备份恢复 memo (${backupMemoLen} 条, 脚本变量仅 ${scriptMemoLen} 条)`);
    restored = {
      ...backup,
      ...scriptVars,
      memo: backup.memo,
      folders: scriptVars.folders ?? backup.folders,
      folderMeta: scriptVars.folderMeta ?? backup.folderMeta,
      pmUiState: scriptVars.pmUiState ?? backup.pmUiState,
      pmThemeSettings: scriptVars.pmThemeSettings ?? backup.pmThemeSettings,
    };
  }

  if (bestMemoLen > 0) {
    let currentLen = 0;
    try {
      currentLen = extractMemoArray(getVariables({ type: 'script', script_id: getScriptId() }) ?? {}).length;
    } catch {
      /* ignore */
    }
    if (currentLen === 0 && extractMemoArray(restored).length > 0) {
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
  }

  return restored;
}

export function writeScriptVars(patch: Record<string, unknown>) {
  let scriptId = '';
  try {
    scriptId = getScriptId();
  } catch {
    /* ignore */
  }
  if (scriptId) rememberScriptId(scriptId);
  if (scriptId) {
    insertOrAssignVariables(patch, { type: 'script', script_id: scriptId });
  } else {
    insertOrAssignVariables(patch, { type: 'script' });
  }
  syncGlobalBackup({ ...readScriptVarsRaw(), ...patch });
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
  writeScriptVars({ ...readScriptVars(), memo });
}

export function getFolders(): string[] {
  const folders = [...((readScriptVars().folders as string[] | undefined) || [])];
  if (!folders.includes('默认')) folders.unshift('默认');
  return folders;
}

export function saveFolders(folders: string[]) {
  writeScriptVars({ ...readScriptVars(), folders });
}

export function getFolderMeta(): Record<string, FolderMeta> {
  const raw = readScriptVars().folderMeta;
  return raw && typeof raw === 'object' ? (raw as Record<string, FolderMeta>) : {};
}

export function saveFolderMeta(meta: Record<string, FolderMeta>) {
  writeScriptVars({ ...readScriptVars(), folderMeta: meta });
}

function parsePmThemeTokens(raw: unknown, mode: PmThemeMode): PmThemeTokens {
  if (!raw || typeof raw !== 'object') return getDefaultPmThemeTokens(mode);
  return migrateLegacyColorScheme(raw as Record<string, unknown>, mode);
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
    dark: parsePmThemeTokens(o.dark, 'dark'),
    light: parsePmThemeTokens(o.light, 'light'),
    customPresets,
  };
}

function defaultPmThemeSettings(): PmThemeSettings {
  return {
    mode: 'dark',
    dark: { ...PM_DEFAULT_DARK },
    light: { ...PM_DEFAULT_LIGHT },
    customPresets: [],
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
  insertOrAssignVariables({ pmThemeSettings: settings }, { type: 'script', script_id: getScriptId() });
  syncGlobalBackup({ ...readScriptVarsRaw(), pmThemeSettings: settings });
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
  writeScriptVars({ ...readScriptVars(), shortcuts });
}

export function loadCurrentFolder(): string {
  const state = readScriptVars().pmUiState as { currentFolder?: string } | undefined;
  const folders = getFolders();
  if (state?.currentFolder && folders.includes(state.currentFolder)) return state.currentFolder;
  return '默认';
}

export function saveCurrentFolder(currentFolder: string) {
  const vars = readScriptVars();
  writeScriptVars({
    ...vars,
    pmUiState: { ...(vars.pmUiState as object | undefined), currentFolder },
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
