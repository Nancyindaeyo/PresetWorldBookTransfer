import { computed, ref } from 'vue';
import type { ExportWbDraft, ExportWbSourceType } from '../export-wb';
import { applyExportBatchToDrafts, buildExportDrafts, executeExportTransfer } from '../lib/export-ops';
import { entryMatchesKeyword } from '../lib/search';

export function createExportState() {
  const exportSearchKeyword = ref('');
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

  const filteredExportDrafts = computed(() => {
    const k = exportSearchKeyword.value;
    return exportDrafts.value.filter(d => entryMatchesKeyword(k, d.name, d.content));
  });

  let refreshDraftsQueued = false;
  function queueRefreshExportDrafts() {
    if (refreshDraftsQueued) return;
    refreshDraftsQueued = true;
    requestAnimationFrame(() => {
      refreshDraftsQueued = false;
      refreshExportDrafts();
    });
  }

  function refreshExportDrafts() {
    exportDrafts.value = buildExportDrafts(exportSourceType.value, {
      exportMemoFolder: exportMemoFolder.value,
      exportSourceWbName: exportSourceWbName.value,
      exportWbEntriesCache: exportWbEntriesCache.value,
    });
    selectedExportKeys.value = new Set();
  }

  function switchExportSource(type: ExportWbSourceType) {
    if (exportSourceType.value === type) return;
    exportSourceType.value = type;
    exportSearchKeyword.value = '';
    queueRefreshExportDrafts();
  }

  function selectExportMemoFolder(folder: string) {
    if (exportMemoFolder.value === folder) return;
    exportMemoFolder.value = folder;
    if (exportSourceType.value === 'memo') queueRefreshExportDrafts();
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
    return applyExportBatchToDrafts(exportDrafts.value, selectedExportKeys.value, exportBatch.value);
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

  return {
    exportSearchKeyword,
    exportSourceType,
    exportSourceWbName,
    exportMemoFolder,
    exportWbEntriesCache,
    exportDrafts,
    selectedExportKeys,
    exportTargetWb,
    exportDrawerOpen,
    exportBatch,
    filteredExportDrafts,
    refreshExportDrafts,
    queueRefreshExportDrafts,
    switchExportSource,
    selectExportMemoFolder,
    loadExportSourceWb,
    applyExportBatch,
    runExportTransfer,
  };
}
