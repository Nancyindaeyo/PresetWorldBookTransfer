import { defineStore } from 'pinia';
import { ref } from 'vue';
import { presetEntryToImportInput, wbEntryToImportInput } from './lib/export-ops';
import { toPresetDraftFromMemo } from './lib/preset-draft';
import { loadCurrentFolder } from './lib/script-vars';
import type { PmTabId } from './schema';
import { createExportState } from './stores/export-state';
import { createImportState } from './stores/import-state';
import { createInsertState } from './stores/insert-state';
import { createMemoState } from './stores/memo-state';
import { createJsonIoActions, createUiState } from './stores/ui-state';

export const usePresetMemoStore = defineStore('preset-memo', () => {
  const currentFolder = ref(loadCurrentFolder());
  const selectedMemoIds = ref(new Set<string>());

  const memoState = createMemoState(currentFolder, selectedMemoIds);
  const uiState = createUiState(currentFolder);
  const insertState = createInsertState();
  const exportState = createExportState();

  function reloadFromVars() {
    memoState.hydrateMemoFromVars();
    uiState.hydrateUiFromVars();
    uiState.hydrated.value = true;
  }

  const importState = createImportState(uiState.activeTab, memoState.setCurrentFolder, reloadFromVars);

  function switchTab(tabId: PmTabId) {
    uiState.persistActiveTab(tabId);
    if (tabId === 'tab-insert') {
      requestAnimationFrame(() => {
        try {
          insertState.syncInsertDraftFromInUseIfClean();
        } catch {
          /* syncInsertDraftFromInUseIfClean 已 toastr */
        }
      });
    }
    if (tabId === 'tab-export-wb') {
      exportState.queueRefreshExportDrafts();
    }
  }

  const { exportJson, importJson } = createJsonIoActions(
    {
      folders: () => memoState.folders.value,
      folderMeta: () => memoState.folderMeta.value,
      memo: () => memoState.memo.value,
      shortcuts: () => uiState.shortcuts.value,
      themeSettings: () => uiState.themeSettings.value,
      currentFolder: () => currentFolder.value,
      activeTab: () => uiState.activeTab.value,
    },
    {
      setFolders: v => {
        memoState.folders.value = v;
      },
      setFolderMeta: v => {
        memoState.folderMeta.value = v;
      },
      setMemo: v => {
        memoState.memo.value = v;
      },
      setShortcuts: v => {
        uiState.shortcuts.value = v;
      },
      setThemeSettings: uiState.setThemeSettings,
      setCurrentFolder: memoState.setCurrentFolder,
      persistActiveTab: uiState.persistActiveTab,
      persistFolders: memoState.persistFolders,
      persistFolderMeta: memoState.persistFolderMeta,
      persistMemo: memoState.persistMemo,
    },
  );

  return {
    hydrated: uiState.hydrated,
    activeTab: uiState.activeTab,
    currentFolder,
    expandedMemoIds: memoState.expandedMemoIds,
    selectedMemoIds,
    searchKeyword: memoState.searchKeyword,
    wbImportSearchKeyword: importState.wbImportSearchKeyword,
    presetImportSearchKeyword: importState.presetImportSearchKeyword,
    exportSearchKeyword: exportState.exportSearchKeyword,
    insertNavSearchKeyword: insertState.insertNavSearchKeyword,
    memo: memoState.memo,
    folders: memoState.folders,
    folderMeta: memoState.folderMeta,
    shortcuts: uiState.shortcuts,
    themeSettings: uiState.themeSettings,
    setThemeSettings: uiState.setThemeSettings,
    persistActiveTab: uiState.persistActiveTab,
    switchTab,
    selectedWbName: importState.selectedWbName,
    wbEntries: importState.wbEntries,
    selectedWbEntryUids: importState.selectedWbEntryUids,
    selectedPresetName: importState.selectedPresetName,
    presetEntries: importState.presetEntries,
    selectedPresetEntryKeys: importState.selectedPresetEntryKeys,
    importWbFolder: importState.importWbFolder,
    importPresetFolder: importState.importPresetFolder,
    insertDraftPrompts: insertState.insertDraftPrompts,
    insertDraftDirty: insertState.insertDraftDirty,
    exportSourceType: exportState.exportSourceType,
    exportSourceWbName: exportState.exportSourceWbName,
    exportMemoFolder: exportState.exportMemoFolder,
    exportWbEntriesCache: exportState.exportWbEntriesCache,
    exportDrafts: exportState.exportDrafts,
    selectedExportKeys: exportState.selectedExportKeys,
    exportTargetWb: exportState.exportTargetWb,
    exportDrawerOpen: exportState.exportDrawerOpen,
    exportBatch: exportState.exportBatch,
    sortedFolders: memoState.sortedFolders,
    currentFolderMemo: memoState.currentFolderMemo,
    filteredMemoEntries: memoState.filteredMemoEntries,
    filteredWbEntries: importState.filteredWbEntries,
    filteredPresetEntries: importState.filteredPresetEntries,
    filteredExportDrafts: exportState.filteredExportDrafts,
    reloadFromVars,
    persistMemo: memoState.persistMemo,
    persistFolders: memoState.persistFolders,
    persistFolderMeta: memoState.persistFolderMeta,
    setCurrentFolder: memoState.setCurrentFolder,
    toggleMemoExpanded: memoState.toggleMemoExpanded,
    updateMemoEntry: memoState.updateMemoEntry,
    deleteMemoEntries: memoState.deleteMemoEntries,
    copyMemoEntry: memoState.copyMemoEntry,
    createMemoEntry: memoState.createMemoEntry,
    reorderFolders: memoState.reorderFolders,
    reorderMemoInFolder: memoState.reorderMemoInFolder,
    batchMoveMemo: memoState.batchMoveMemo,
    importEntries: importState.importEntries,
    loadWorldbook: importState.loadWorldbook,
    loadPreset: importState.loadPreset,
    ensureInsertDraftLoaded: insertState.ensureInsertDraftLoaded,
    syncInsertDraftFromInUseIfClean: insertState.syncInsertDraftFromInUseIfClean,
    resetInsertDraft: insertState.resetInsertDraft,
    setupInsertPresetExternalSync: insertState.setupInsertPresetExternalSync,
    teardownInsertPresetExternalSync: insertState.teardownInsertPresetExternalSync,
    insertDraftsAt: insertState.insertDraftsAt,
    getInsertSaveSummary: insertState.getInsertSaveSummary,
    saveInsertDraft: insertState.saveInsertDraft,
    refreshExportDrafts: exportState.refreshExportDrafts,
    queueRefreshExportDrafts: exportState.queueRefreshExportDrafts,
    switchExportSource: exportState.switchExportSource,
    selectExportMemoFolder: exportState.selectExportMemoFolder,
    loadExportSourceWb: exportState.loadExportSourceWb,
    applyExportBatch: exportState.applyExportBatch,
    runExportTransfer: exportState.runExportTransfer,
    exportJson,
    importJson,
    wbEntryToImportInput,
    presetEntryToImportInput,
    toPresetDraftFromMemo,
  };
});
