import { ref, computed } from 'vue';
import { applyImportToMemo, findImportDuplicates, type ImportDuplicateMode } from '../lib/import-ops';
import { entryMatchesKeyword } from '../lib/search';
import type { PmTabId } from '../schema';

export function createImportState(
  activeTab: { value: PmTabId },
  setCurrentFolder: (folder: string) => void,
  reloadFromVars: () => void,
) {
  const wbImportSearchKeyword = ref('');
  const presetImportSearchKeyword = ref('');
  const selectedWbName = ref('');
  const wbEntries = ref<WorldbookEntry[]>([]);
  const selectedWbEntryUids = ref(new Set<number>());
  const selectedPresetName = ref('');
  const presetEntries = ref<Record<string, unknown>[]>([]);
  const selectedPresetEntryKeys = ref(new Set<string>());
  const importWbFolder = ref('默认');
  const importPresetFolder = ref('默认');

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

  return {
    wbImportSearchKeyword,
    presetImportSearchKeyword,
    selectedWbName,
    wbEntries,
    selectedWbEntryUids,
    selectedPresetName,
    presetEntries,
    selectedPresetEntryKeys,
    importWbFolder,
    importPresetFolder,
    filteredWbEntries,
    filteredPresetEntries,
    loadWorldbook,
    loadPreset,
    importEntries,
  };
}
