<template>
  <div id="tab-import-preset" class="pm-tab-content">
    <div class="pm-form-group pm-form-compact">
      <label>选择预设</label>
      <PmSearchableSelect
        v-model="presetName"
        :options="presetNames"
        placeholder="点击选择或输入搜索..."
        @change="onPresetChange"
      />
    </div>

    <div class="pm-sticky-footer pm-sticky-header pm-sticky-stack">
      <PmSearchBox v-model="store.presetImportSearchKeyword" placeholder="按条目名/内容搜索..." compact />
      <div class="pm-import-toolbar-row">
        <label>导入到</label>
        <select v-model="store.importPresetFolder" class="text_pole">
          <option v-for="f in store.folders" :key="f" :value="f">{{ f }}</option>
        </select>
        <div class="menu_button interactable pm-btn pm-btn-icon" title="新建文件夹" @click="newFolder">
          <i class="fa-solid fa-folder-plus"></i>
        </div>
      </div>
      <div class="pm-import-toolbar-row pm-import-toolbar-actions">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0">
          <label class="pm-select-all">
            <input type="checkbox" class="pm-checkbox" :checked="allChecked" :indeterminate.prop="indeterminate" @change="toggleAll" />
            <span>全选</span>
          </label>
          <div class="pm-hint">已选中 {{ selectedCount }} 个条目</div>
        </div>
        <div class="menu_button interactable pm-btn-import" @click="doImport">
          <i class="fa-solid fa-download"></i> 导入
        </div>
      </div>
    </div>

    <div class="pm-list pm-wb-list" style="flex: 1; min-height: 0">
      <div v-if="!presetName" class="pm-empty-state">请先在上方选择一个预设。</div>
      <div v-else-if="store.presetEntries.length === 0" class="pm-empty-state">该预设为空。</div>
      <div
        v-for="(entry, index) in store.filteredPresetEntries"
        :key="entryKey(entry, index)"
        class="wb-entry-item"
        @click="toggleEntry(entryKey(entry, index))"
      >
        <div class="wb-entry-header">
          <input
            type="checkbox"
            class="preset-entry-checkbox pm-checkbox"
            :checked="store.selectedPresetEntryKeys.has(entryKey(entry, index))"
            @click.stop
            @change="setEntry(entryKey(entry, index), ($event.target as HTMLInputElement).checked)"
          />
          <div class="wb-content">
            <div class="wb-title">{{ entry.name || entry.id || '未命名条目' }}</div>
            <div class="wb-desc">{{ preview(String(entry.content || '')) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { usePmDialog } from '../composables/usePmDialog';
import { usePresetMemoStore } from '../store';
import PmSearchBox from './PmSearchBox.vue';
import PmSearchableSelect from './PmSearchableSelect.vue';

const store = usePresetMemoStore();
const { pmPrompt, pmChoice } = usePmDialog();
const presetName = ref(store.selectedPresetName);
const presetNames = ref<string[]>([]);

function entryKey(entry: Record<string, unknown>, index: number) {
  return String(entry.id ?? entry.identifier ?? index);
}

const visibleKeys = computed(() =>
  store.filteredPresetEntries.map((e, i) => entryKey(e, store.presetEntries.indexOf(e))),
);

const selectedCount = computed(() => store.selectedPresetEntryKeys.size);
const allChecked = computed(
  () => visibleKeys.value.length > 0 && visibleKeys.value.every(k => store.selectedPresetEntryKeys.has(k)),
);
const indeterminate = computed(() => {
  const c = visibleKeys.value.filter(k => store.selectedPresetEntryKeys.has(k)).length;
  return c > 0 && c < visibleKeys.value.length;
});

function preview(content: string) {
  const t = content.replace(/\s+/g, ' ').trim();
  return t.length > 100 ? t.slice(0, 100) + '…' : t || '(空内容)';
}

function onPresetChange(name: string) {
  store.loadPreset(name);
}

async function newFolder() {
  const name = await pmPrompt('请输入新文件夹名称:');
  if (!name?.trim()) return;
  const folderName = name.trim();
  if (store.folders.includes(folderName)) {
    toastr.warning('文件夹已存在');
    return;
  }
  store.folders.push(folderName);
  store.persistFolders();
  store.importPresetFolder = folderName;
}

function toggleEntry(key: string) {
  const next = new Set(store.selectedPresetEntryKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  store.selectedPresetEntryKeys = next;
}

function setEntry(key: string, checked: boolean) {
  const next = new Set(store.selectedPresetEntryKeys);
  if (checked) next.add(key);
  else next.delete(key);
  store.selectedPresetEntryKeys = next;
}

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const next = new Set(store.selectedPresetEntryKeys);
  visibleKeys.value.forEach(k => (checked ? next.add(k) : next.delete(k)));
  store.selectedPresetEntryKeys = next;
}

async function doImport() {
  const selected = store.presetEntries.filter((e, i) =>
    store.selectedPresetEntryKeys.has(entryKey(e, i)),
  );
  if (selected.length === 0) {
    toastr.warning('请先勾选要导入的条目');
    return;
  }
  const result = await store.importEntries(
    selected.map(e => store.presetEntryToImportInput(e)),
    store.importPresetFolder,
    pmChoice,
  );
  if (!result) return;
  const parts = [];
  if (result.added) parts.push(`新增 ${result.added}`);
  if (result.updated) parts.push(`覆盖 ${result.updated}`);
  if (result.skipped) parts.push(`跳过 ${result.skipped}`);
  toastr.success(`导入完成: ${parts.join(' / ')} (目标文件夹: "${store.importPresetFolder}")`);
}

onMounted(() => {
  presetNames.value = getPresetNames();
});
</script>
