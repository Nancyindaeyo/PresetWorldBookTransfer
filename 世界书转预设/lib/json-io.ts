import { MemoSchema, type MemoEntry, type Shortcut, type PmTabId } from '../schema';
import type { FolderMeta } from './script-vars';
import { clonePmThemeSettings, type PmThemeSettings } from '../theme';

export const PM_JSON_EXPORT_VERSION = 2;

export type PmJsonExport = {
  version: number;
  exportedAt: string;
  folders: string[];
  folderMeta: Record<string, FolderMeta>;
  memo: MemoEntry[];
  shortcuts: Shortcut[];
  themeSettings?: PmThemeSettings;
  pmUiState?: { currentFolder?: string; activeTab?: PmTabId };
};

export type PmJsonImportMode = 'merge' | 'replace';

export type PmJsonImportPayload = {
  memoCount: number;
  folderCount: number;
  mergedShortcuts: boolean;
  mergedTheme: boolean;
  mergedUiState: boolean;
};

function parseShortcuts(raw: unknown): Shortcut[] | null {
  if (!Array.isArray(raw)) return null;
  const result: Shortcut[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || typeof (item as Shortcut).label !== 'string') continue;
    result.push({ label: String((item as Shortcut).label), insert: String((item as Shortcut).insert) });
  }
  return result.length > 0 ? result : null;
}

function parseFolderMeta(raw: unknown): Record<string, FolderMeta> | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, FolderMeta>;
}

function parsePmUiState(raw: unknown): { currentFolder?: string; activeTab?: PmTabId } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tabIds: PmTabId[] = [
    'tab-memo',
    'tab-import',
    'tab-import-preset',
    'tab-insert',
    'tab-export-wb',
  ];
  const activeTab =
    typeof o.activeTab === 'string' && tabIds.includes(o.activeTab as PmTabId)
      ? (o.activeTab as PmTabId)
      : undefined;
  const currentFolder = typeof o.currentFolder === 'string' ? o.currentFolder : undefined;
  if (!activeTab && !currentFolder) return null;
  return { currentFolder, activeTab };
}

function mergeFolderMeta(
  base: Record<string, FolderMeta>,
  imported: Record<string, FolderMeta>,
): Record<string, FolderMeta> {
  return { ...base, ...imported };
}

function mergeFolders(base: string[], imported: string[]): string[] {
  const merged = [...base];
  imported.forEach(f => {
    if (!merged.includes(f)) merged.push(f);
  });
  if (!merged.includes('默认')) merged.unshift('默认');
  return merged;
}

export function buildPmJsonExport(data: {
  folders: string[];
  folderMeta: Record<string, FolderMeta>;
  memo: MemoEntry[];
  shortcuts: Shortcut[];
  themeSettings: PmThemeSettings;
  currentFolder: string;
  activeTab: PmTabId;
}): PmJsonExport {
  return {
    version: PM_JSON_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    folders: data.folders,
    folderMeta: data.folderMeta,
    memo: data.memo,
    shortcuts: data.shortcuts,
    themeSettings: clonePmThemeSettings(data.themeSettings),
    pmUiState: { currentFolder: data.currentFolder, activeTab: data.activeTab },
  };
}

export function applyPmJsonImport(
  data: Record<string, unknown>,
  mode: PmJsonImportMode,
  current: {
    folders: string[];
    folderMeta: Record<string, FolderMeta>;
    memo: MemoEntry[];
    shortcuts: Shortcut[];
    themeSettings: PmThemeSettings;
    currentFolder: string;
    activeTab: PmTabId;
  },
): {
  folders: string[];
  folderMeta: Record<string, FolderMeta>;
  memo: MemoEntry[];
  shortcuts: Shortcut[];
  themeSettings: PmThemeSettings;
  currentFolder: string;
  activeTab: PmTabId;
  summary: PmJsonImportPayload;
} {
  const memoParsed = MemoSchema.safeParse(data.memo || []);
  if (!memoParsed.success) throw new Error('INVALID_MEMO');

  const importedFolders = Array.isArray(data.folders)
    ? data.folders.filter((f): f is string => typeof f === 'string')
    : [];
  const importedMemo = memoParsed.data;
  const importedFolderMeta = parseFolderMeta(data.folderMeta);
  const importedShortcuts = parseShortcuts(data.shortcuts);
  const importedTheme = data.themeSettings as PmThemeSettings | undefined;
  const importedUi = parsePmUiState(data.pmUiState);

  let folders = current.folders;
  let folderMeta = current.folderMeta;
  let memo = current.memo;
  let shortcuts = current.shortcuts;
  let themeSettings = current.themeSettings;
  let currentFolder = current.currentFolder;
  let activeTab = current.activeTab;

  let mergedShortcuts = false;
  let mergedTheme = false;
  let mergedUiState = false;

  if (mode === 'replace') {
    folders = importedFolders.length > 0 ? importedFolders : ['默认'];
    memo = importedMemo;
    if (importedFolderMeta) folderMeta = importedFolderMeta;
    if (importedShortcuts) shortcuts = importedShortcuts;
    if (importedTheme && typeof importedTheme === 'object') {
      themeSettings = clonePmThemeSettings(importedTheme as PmThemeSettings);
      mergedTheme = true;
    }
    if (importedUi) {
      if (importedUi.currentFolder) currentFolder = importedUi.currentFolder;
      if (importedUi.activeTab) activeTab = importedUi.activeTab;
      mergedUiState = true;
    }
    if (importedShortcuts) mergedShortcuts = true;
  } else {
    folders = mergeFolders(folders, importedFolders);
    if (importedFolderMeta) folderMeta = mergeFolderMeta(folderMeta, importedFolderMeta);
    const existingIds = new Set(memo.map(e => e.id));
    importedMemo.forEach(e => {
      if (!existingIds.has(e.id)) {
        if (!folders.includes(e.folder || '默认')) e.folder = '默认';
        memo.push(e);
      }
    });
    if (importedShortcuts) {
      shortcuts = importedShortcuts;
      mergedShortcuts = true;
    }
    if (importedTheme && typeof importedTheme === 'object') {
      themeSettings = clonePmThemeSettings(importedTheme as PmThemeSettings);
      mergedTheme = true;
    }
    if (importedUi) {
      if (importedUi.currentFolder) currentFolder = importedUi.currentFolder;
      if (importedUi.activeTab) activeTab = importedUi.activeTab;
      mergedUiState = true;
    }
  }

  if (!folders.includes(currentFolder)) {
    currentFolder = folders.includes('默认') ? '默认' : folders[0] ?? '默认';
  }

  return {
    folders,
    folderMeta,
    memo,
    shortcuts,
    themeSettings,
    currentFolder,
    activeTab,
    summary: {
      memoCount: importedMemo.length,
      folderCount: importedFolders.length,
      mergedShortcuts,
      mergedTheme,
      mergedUiState,
    },
  };
}
