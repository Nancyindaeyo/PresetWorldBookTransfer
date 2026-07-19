import { ref, watch } from 'vue';
import { applyPmJsonImport, buildPmJsonExport } from '../lib/json-io';
import {
  loadActiveTab,
  loadPmThemeSettings,
  saveActiveTab,
  savePmThemeSettings,
  saveShortcuts,
  getShortcuts,
  type FolderMeta,
} from '../lib/script-vars';
import { DEFAULT_SHORTCUTS, type MemoEntry, type PmTabId, type Shortcut } from '../schema';
import { clonePmThemeSettings, PM_DEFAULT_DARK, PM_DEFAULT_LIGHT, type PmThemeSettings } from '../theme';

export function createUiState(_currentFolder: { value: string }) {
  const hydrated = ref(false);
  const activeTab = ref<PmTabId>(loadActiveTab());
  const shortcuts = ref<Shortcut[]>([...DEFAULT_SHORTCUTS]);
  const themeSettings = ref<PmThemeSettings>({
    mode: 'dark',
    dark: { ...PM_DEFAULT_DARK },
    light: { ...PM_DEFAULT_LIGHT },
    customPresets: [],
  });

  function hydrateUiFromVars() {
    shortcuts.value = getShortcuts();
    themeSettings.value = loadPmThemeSettings();
    activeTab.value = loadActiveTab();
  }

  function setThemeSettings(settings: PmThemeSettings) {
    themeSettings.value = clonePmThemeSettings(settings);
  }

  function persistActiveTab(tab: PmTabId) {
    activeTab.value = tab;
    saveActiveTab(tab);
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
    hydrated,
    activeTab,
    shortcuts,
    themeSettings,
    hydrateUiFromVars,
    setThemeSettings,
    persistActiveTab,
    saveShortcuts,
  };
}

export function createJsonIoActions(
  getters: {
    folders: () => string[];
    folderMeta: () => Record<string, FolderMeta>;
    memo: () => MemoEntry[];
    shortcuts: () => Shortcut[];
    themeSettings: () => PmThemeSettings;
    currentFolder: () => string;
    activeTab: () => PmTabId;
  },
  setters: {
    setFolders: (v: string[]) => void;
    setFolderMeta: (v: Record<string, FolderMeta>) => void;
    setMemo: (v: MemoEntry[]) => void;
    setShortcuts: (v: Shortcut[]) => void;
    setThemeSettings: (v: PmThemeSettings) => void;
    setCurrentFolder: (v: string) => void;
    persistActiveTab: (v: PmTabId) => void;
    persistFolders: () => void;
    persistFolderMeta: () => void;
    persistMemo: () => void;
  },
) {
  function exportJson() {
    return buildPmJsonExport({
      folders: getters.folders(),
      folderMeta: getters.folderMeta(),
      memo: getters.memo(),
      shortcuts: getters.shortcuts(),
      themeSettings: getters.themeSettings(),
      currentFolder: getters.currentFolder(),
      activeTab: getters.activeTab(),
    });
  }

  function importJson(data: Record<string, unknown>, mode: 'merge' | 'replace') {
    const result = applyPmJsonImport(data, mode, {
      folders: getters.folders(),
      folderMeta: getters.folderMeta(),
      memo: getters.memo(),
      shortcuts: getters.shortcuts(),
      themeSettings: getters.themeSettings(),
      currentFolder: getters.currentFolder(),
      activeTab: getters.activeTab(),
    });

    setters.setFolders(result.folders);
    setters.setFolderMeta(result.folderMeta);
    setters.setMemo(result.memo);
    setters.setShortcuts(result.shortcuts);
    setters.setThemeSettings(result.themeSettings);
    setters.setCurrentFolder(result.currentFolder);
    setters.persistActiveTab(result.activeTab);

    setters.persistFolders();
    setters.persistFolderMeta();
    setters.persistMemo();
    saveShortcuts(result.shortcuts);
    savePmThemeSettings(result.themeSettings);
    saveActiveTab(result.activeTab);

    return result.summary;
  }

  return { exportJson, importJson };
}
