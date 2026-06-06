import _ from 'lodash';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { ExportWbDraft, ExportWbSourceType } from './export-wb';
import { applyImportToMemo, findImportDuplicates, type ImportDuplicateMode } from './lib/import-ops';
import {
  buildExportDrafts,
  applyExportBatchToDrafts,
  executeExportTransfer,
  wbEntryToImportInput,
  presetEntryToImportInput,
} from './lib/export-ops';
import {
  createInsertDraftBaseline,
  getInsertDraftSaveSummary,
  saveInUsePresetPrompts,
  toPresetDraft,
  toPresetDraftFromMemo,
  type PresetPromptDraft,
} from './lib/preset-draft';
import { entryMatchesKeyword } from './lib/search';
import {
  ensureMemoFolderVisible,
  getFolderMeta,
  getFolders,
  getMemoData,
  getShortcuts,
  loadCurrentFolder,
  loadPmThemeSettings,
  saveCurrentFolder,
  saveFolderMeta,
  saveFolders,
  saveMemoData,
  savePmThemeSettings,
  saveShortcuts,
  type FolderMeta,
} from './lib/script-vars';
import { genMemoId, MemoSchema, type MemoEntry, type PmTabId, type Shortcut } from './schema';
import { clonePmThemeSettings, type PmThemeSettings } from './theme';

export const usePresetMemoStore = defineStore('preset-memo', () => {
  const activeTab = ref<PmTabId>('tab-memo');
  const currentFolder = ref(loadCurrentFolder());
  const expandedMemoIds = ref(new Set<string>());
  const selectedMemoIds = ref(new Set<string>());

  const searchKeyword = ref('');
  const wbImportSearchKeyword = ref('');
  const presetImportSearchKeyword = ref('');
  const exportSearchKeyword = ref('');
  const insertNavSearchKeyword = ref('');

  const memo = ref<MemoEntry[]>(getMemoData());
  const folders = ref<string[]>(getFolders());
  const folderMeta = ref<Record<string, FolderMeta>>(getFolderMeta());
  const shortcuts = ref<Shortcut[]>(getShortcuts());
  const themeSettings = ref<PmThemeSettings>(loadPmThemeSettings());

  const selectedWbName = ref('');
  const wbEntries = ref<WorldbookEntry[]>([]);
  const selectedWbEntryUids = ref(new Set<number>());

  const selectedPresetName = ref('');
  const presetEntries = ref<Record<string, unknown>[]>([]);
  const selectedPresetEntryKeys = ref(new Set<string>());

  const importWbFolder = ref('默认');
  const importPresetFolder = ref('默认');

  const insertDraftPrompts = ref<PresetPromptDraft[] | null>(null);
  const insertDraftBaselineIds = ref<Set<string> | null>(null);
  const insertDraftBaselineNames = ref<Set<string> | null>(null);
  const insertDraftBaselineEnabledById = ref<Map<string, boolean> | null>(null);
  const insertDraftDirty = ref(false);

  const exportSourceType = ref<ExportWbSourceType>('preset');
  const exportSourceWbName = ref('');
  const exportMemoFolder = ref('默认');
  const exportWbEntriesCache = ref<WorldbookEntry[]>([]);
  const exportDrafts = ref<ExportWbDraft[]>([]);
  const selectedExportKeys = ref(new Set<string>());
  const exportTargetWb = ref('');
  const exportDrawerOpen = ref(false);
  const exportBatch = ref({
    strategy: '',
    position: '',
    order: '',
    depth: '',
    preventIn: false,
    preventOut: false,
  });

  const sortedFolders = computed(() => {
    const pinned: string[] = [];
    const normal: string[] = [];
    folders.value.forEach(f => {
      if (f === '默认') return;
      if (folderMeta.value[f]?.pinned) pinned.push(f);
      else normal.push(f);
    });
    return ['默认', ...pinned, ...normal];
  });

  const currentFolderMemo = computed(() =>
    memo.value.filter(e => (e.folder || '默认') === currentFolder.value),
  );

  const filteredMemoEntries = computed(() => {
    const k = searchKeyword.value;
    return currentFolderMemo.value.filter(e => entryMatchesKeyword(k, e.name, e.content));
  });

  const filteredWbEntries = computed(() => {
    const k = wbImportSearchKeyword.value;
    return wbEntries.value.filter(e => entryMatchesKeyword(k, e.name || '', e.content || ''));
  });

  const filteredPresetEntries = computed(() => {
    const k = presetImportSearchKeyword.value;
    return presetEntries.value.filter((e, i) => {
      const name = String(e.name || e.id || `条目 ${i}`);
      const content = String(e.content || '');
      return entryMatchesKeyword(k, name, content);
    });
  });

  const filteredExportDrafts = computed(() => {
    const k = exportSearchKeyword.value;
    return exportDrafts.value.filter(d => entryMatchesKeyword(k, d.name, d.content));
  });

  function reloadFromVars() {
    memo.value = getMemoData();
    folders.value = getFolders();
    folderMeta.value = getFolderMeta();
    shortcuts.value = getShortcuts();
    themeSettings.value = loadPmThemeSettings();
    currentFolder.value = ensureMemoFolderVisible(memo.value, currentFolder.value);
  }

  function persistMemo() {
    saveMemoData(_.cloneDeep(memo.value));
  }

  function persistFolders() {
    saveFolders(_.cloneDeep(folders.value));
  }

  function persistFolderMeta() {
    saveFolderMeta(_.cloneDeep(folderMeta.value));
  }

  function setCurrentFolder(folder: string) {
    currentFolder.value = folder;
    saveCurrentFolder(folder);
    selectedMemoIds.value = new Set();
  }

  function toggleMemoExpanded(id: string) {
    const next = new Set(expandedMemoIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedMemoIds.value = next;
  }

  function updateMemoEntry(id: string, patch: Partial<MemoEntry>) {
    const idx = memo.value.findIndex(e => e.id === id);
    if (idx === -1) return;
    memo.value[idx] = { ...memo.value[idx], ...patch };
    persistMemo();
  }

  function deleteMemoEntries(ids: string[]) {
    const idSet = new Set(ids);
    memo.value = memo.value.filter(e => !idSet.has(e.id));
    ids.forEach(id => expandedMemoIds.value.delete(id));
    expandedMemoIds.value = new Set(expandedMemoIds.value);
    selectedMemoIds.value = new Set([...selectedMemoIds.value].filter(id => !idSet.has(id)));
    persistMemo();
  }

  function copyMemoEntry(id: string) {
    const idx = memo.value.findIndex(e => e.id === id);
    if (idx === -1) return;
    const src = memo.value[idx];
    const copy: MemoEntry = {
      id: genMemoId(),
      name: src.name + ' (副本)',
      content: src.content,
      enabled: src.enabled,
      role: src.role,
      position: { type: 'relative' },
      folder: src.folder,
    };
    memo.value.splice(idx + 1, 0, copy);
    expandedMemoIds.value = new Set([...expandedMemoIds.value, copy.id]);
    persistMemo();
    return copy.id;
  }

  function createMemoEntry(folder?: string) {
    const targetFolder = folder ?? (folders.value.includes(currentFolder.value) ? currentFolder.value : '默认');
    const entry: MemoEntry = {
      id: genMemoId(),
      name: '新条目',
      content: '',
      enabled: true,
      role: 'system',
      position: { type: 'relative' },
      folder: targetFolder,
    };
    memo.value.push(entry);
    expandedMemoIds.value = new Set([...expandedMemoIds.value, entry.id]);
    persistMemo();
    return entry.id;
  }

  function reorderFolders(orderedNonDefault: string[]) {
    const meta = folderMeta.value;
    const pinned = orderedNonDefault.filter(f => meta[f]?.pinned);
    const normal = orderedNonDefault.filter(f => !meta[f]?.pinned);
    folders.value = ['默认', ...normal, ...pinned];
    persistFolders();
  }

  function reorderMemoInFolder(orderedIds: string[]) {
    const current = orderedIds
      .map(id => memo.value.find(e => e.id === id))
      .filter((e): e is MemoEntry => !!e);
    const other = memo.value.filter(e => (e.folder || '默认') !== currentFolder.value);
    memo.value = [...current, ...other];
    persistMemo();
  }

  function batchMoveMemo(targetFolder: string, ids: string[]) {
    const idSet = new Set(ids);
    memo.value.forEach(e => {
      if (idSet.has(e.id)) e.folder = targetFolder;
    });
    persistMemo();
    selectedMemoIds.value = new Set();
  }

  async function importEntries(
    entries: { name: string; content: string; role: 'system' | 'user' | 'assistant' }[],
    targetFolder: string,
    pmChoice: <T extends string>(
      msg: string,
      opts: { label: string; value: T; variant?: 'primary' | 'danger' | 'default' }[],
    ) => Promise<T | null>,
  ) {
    const duplicates = findImportDuplicates(entries, targetFolder);
    let mode: ImportDuplicateMode = 'add';
    if (duplicates.length > 0) {
      const choice = await pmChoice<'overwrite' | 'skip' | 'add'>(
        `检测到 ${duplicates.length} 个同名条目 (已存在于 "${targetFolder}" 中):\n` +
          duplicates
            .slice(0, 5)
            .map(d => '• ' + d.name)
            .join('\n') +
          (duplicates.length > 5 ? `\n…还有 ${duplicates.length - 5} 个` : '') +
          '\n\n如何处理这些重复条目?',
        [
          { label: '覆盖', value: 'overwrite', variant: 'primary' },
          { label: '跳过', value: 'skip' },
          { label: '全部新增', value: 'add', variant: 'danger' },
        ],
      );
      if (choice === null) return null;
      mode = choice;
    }
    const result = applyImportToMemo(entries, targetFolder, mode);
    reloadFromVars();
    setCurrentFolder(targetFolder);
    activeTab.value = 'tab-memo';
    return result;
  }

  async function loadWorldbook(name: string) {
    selectedWbName.value = name;
    if (!name) {
      wbEntries.value = [];
      return;
    }
    wbEntries.value = (await getWorldbook(name)) || [];
    selectedWbEntryUids.value = new Set();
  }

  function loadPreset(name: string) {
    selectedPresetName.value = name;
    if (!name) {
      presetEntries.value = [];
      return;
    }
    const preset = getPreset(name);
    presetEntries.value = (preset.prompts || []) as Record<string, unknown>[];
    selectedPresetEntryKeys.value = new Set();
  }

  function ensureInsertDraftLoaded() {
    if (insertDraftPrompts.value) return;
    let preset: Preset;
    try {
      preset = getPreset('in_use');
    } catch (e) {
      console.error('[预设备忘录] 无法读取 in_use 预设', e);
      toastr.error('无法读取当前预设，请先在酒馆中加载一个预设');
      throw e;
    }
    const drafts = (preset.prompts || []).map(p => toPresetDraft(p as Record<string, unknown>));
    insertDraftPrompts.value = drafts;
    const baseline = createInsertDraftBaseline(drafts);
    insertDraftBaselineIds.value = baseline.ids;
    insertDraftBaselineNames.value = baseline.names;
    insertDraftBaselineEnabledById.value = baseline.enabledById;
  }

  function resetInsertDraft() {
    insertDraftPrompts.value = null;
    insertDraftBaselineIds.value = null;
    insertDraftBaselineNames.value = null;
    insertDraftBaselineEnabledById.value = null;
    insertDraftDirty.value = false;
  }

  function insertDraftsAt(index: number, drafts: PresetPromptDraft[]) {
    ensureInsertDraftLoaded();
    insertDraftPrompts.value!.splice(index, 0, ...drafts);
    insertDraftDirty.value = true;
  }

  function getInsertSaveSummary() {
    return getInsertDraftSaveSummary(
      insertDraftPrompts.value,
      insertDraftBaselineIds.value,
      insertDraftBaselineNames.value,
      insertDraftBaselineEnabledById.value,
    );
  }

  async function saveInsertDraft() {
    if (!insertDraftPrompts.value) return;
    await saveInUsePresetPrompts(insertDraftPrompts.value);
    resetInsertDraft();
  }

  function refreshExportDrafts() {
    exportDrafts.value = buildExportDrafts(exportSourceType.value, {
      exportMemoFolder: exportMemoFolder.value,
      exportSourceWbName: exportSourceWbName.value,
      exportWbEntriesCache: exportWbEntriesCache.value,
    });
    selectedExportKeys.value = new Set();
  }

  async function loadExportSourceWb(name: string) {
    exportSourceWbName.value = name;
    if (!name) {
      exportWbEntriesCache.value = [];
      refreshExportDrafts();
      return;
    }
    exportWbEntriesCache.value = (await getWorldbook(name)) || [];
    refreshExportDrafts();
  }

  function applyExportBatch() {
    const count = applyExportBatchToDrafts(exportDrafts.value, selectedExportKeys.value, exportBatch.value);
    return count;
  }

  async function runExportTransfer(mode: 'copy' | 'move', skipDuplicateCheck = false) {
    const checked = exportDrafts.value.filter(d => selectedExportKeys.value.has(d.sourceKey));
    return executeExportTransfer({
      mode,
      targetWbName: exportTargetWb.value.trim(),
      sourceType: exportSourceType.value,
      exportSourceWbName: exportSourceWbName.value,
      drafts: checked,
      skipDuplicateCheck,
    });
  }

  function exportJson() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      folders: folders.value,
      folderMeta: folderMeta.value,
      memo: memo.value,
      shortcuts: shortcuts.value,
    };
  }

  function importJson(
    data: Record<string, unknown>,
    mode: 'merge' | 'replace',
  ): { memoCount: number; folderCount: number } {
    const memoParsed = MemoSchema.safeParse(data.memo || []);
    if (!memoParsed.success) throw new Error('INVALID_MEMO');
    const importedFolders = Array.isArray(data.folders)
      ? data.folders.filter((f): f is string => typeof f === 'string')
      : [];
    const importedMemo = memoParsed.data;

    if (mode === 'replace') {
      folders.value = importedFolders.length > 0 ? importedFolders : ['默认'];
      memo.value = importedMemo;
      if (data.folderMeta && typeof data.folderMeta === 'object') {
        folderMeta.value = data.folderMeta as Record<string, FolderMeta>;
      }
      if (Array.isArray(data.shortcuts)) {
        shortcuts.value = data.shortcuts
          .filter(
            (it): it is Shortcut =>
              !!it && typeof it === 'object' && typeof (it as Shortcut).label === 'string',
          )
          .map(it => ({ label: String((it as Shortcut).label), insert: String((it as Shortcut).insert) }));
      }
      persistFolders();
      persistFolderMeta();
      persistMemo();
      saveShortcuts(shortcuts.value);
    } else {
      const mergedFolders = [...folders.value];
      importedFolders.forEach(f => {
        if (!mergedFolders.includes(f)) mergedFolders.push(f);
      });
      folders.value = mergedFolders;
      const existingIds = new Set(memo.value.map(e => e.id));
      importedMemo.forEach(e => {
        if (!existingIds.has(e.id)) {
          if (!mergedFolders.includes(e.folder || '默认')) e.folder = '默认';
          memo.value.push(e);
        }
      });
      persistFolders();
      persistMemo();
    }
    return { memoCount: importedMemo.length, folderCount: importedFolders.length };
  }

  function setThemeSettings(settings: PmThemeSettings) {
    themeSettings.value = clonePmThemeSettings(settings);
  }

  let themePersistTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    themeSettings,
    s => {
      if (themePersistTimer) clearTimeout(themePersistTimer);
      themePersistTimer = setTimeout(() => {
        themePersistTimer = null;
        savePmThemeSettings(clonePmThemeSettings(s));
      }, 200);
    },
    { deep: true },
  );

  return {
    activeTab,
    currentFolder,
    expandedMemoIds,
    selectedMemoIds,
    searchKeyword,
    wbImportSearchKeyword,
    presetImportSearchKeyword,
    exportSearchKeyword,
    insertNavSearchKeyword,
    memo,
    folders,
    folderMeta,
    shortcuts,
    themeSettings,
    setThemeSettings,
    selectedWbName,
    wbEntries,
    selectedWbEntryUids,
    selectedPresetName,
    presetEntries,
    selectedPresetEntryKeys,
    importWbFolder,
    importPresetFolder,
    insertDraftPrompts,
    insertDraftDirty,
    exportSourceType,
    exportSourceWbName,
    exportMemoFolder,
    exportWbEntriesCache,
    exportDrafts,
    selectedExportKeys,
    exportTargetWb,
    exportDrawerOpen,
    exportBatch,
    sortedFolders,
    currentFolderMemo,
    filteredMemoEntries,
    filteredWbEntries,
    filteredPresetEntries,
    filteredExportDrafts,
    reloadFromVars,
    persistMemo,
    persistFolders,
    persistFolderMeta,
    setCurrentFolder,
    toggleMemoExpanded,
    updateMemoEntry,
    deleteMemoEntries,
    copyMemoEntry,
    createMemoEntry,
    reorderFolders,
    reorderMemoInFolder,
    batchMoveMemo,
    importEntries,
    loadWorldbook,
    loadPreset,
    ensureInsertDraftLoaded,
    resetInsertDraft,
    insertDraftsAt,
    getInsertSaveSummary,
    saveInsertDraft,
    refreshExportDrafts,
    loadExportSourceWb,
    applyExportBatch,
    runExportTransfer,
    exportJson,
    importJson,
    wbEntryToImportInput,
    presetEntryToImportInput,
    toPresetDraftFromMemo,
  };
});
