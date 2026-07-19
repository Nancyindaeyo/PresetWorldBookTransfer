<template>
  <div id="tab-import" class="pm-tab-content">
    <div class="pm-form-group pm-form-compact">
      <label>选择世界书</label>
      <PmSearchableSelect
        v-model="wbName"
        :options="wbNames"
        placeholder="点击选择或输入搜索..."
        @change="onWbChange"
      />
    </div>

    <div class="pm-sticky-footer pm-sticky-header pm-sticky-stack">
      <PmSearchBox v-model="store.wbImportSearchKeyword" placeholder="按条目名/内容搜索..." compact />
      <div class="pm-import-toolbar-row">
        <label>导入到</label>
        <select v-model="store.importWbFolder" class="text_pole">
          <option v-for="f in store.folders" :key="f" :value="f">{{ f }}</option>
        </select>
        <div class="menu_button interactable pm-btn pm-btn-icon" title="新建文件夹" @click="newFolder">
          <i class="fa-solid fa-folder-plus"></i>
        </div>
      </div>
      <div class="pm-import-toolbar-row pm-import-toolbar-actions">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0">
          <label class="pm-select-all" title="全选 / 反选">
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
      <div v-if="!wbName" class="pm-empty-state">请先在上方选择一本世界书。</div>
      <div v-else-if="store.wbEntries.length === 0" class="pm-empty-state">该世界书为空。</div>
      <div
        v-for="entry in store.filteredWbEntries"
        :key="entry.uid"
        class="wb-entry-item"
        @click="toggleEntry(entry.uid)"
      >
        <div class="wb-entry-header">
          <input
            type="checkbox"
            class="wb-entry-checkbox pm-checkbox"
            :checked="store.selectedWbEntryUids.has(entry.uid)"
            @click.stop
            @change="setEntry(entry.uid, ($event.target as HTMLInputElement).checked)"
          />
          <div class="wb-content">
            <div class="wb-title">{{ entry.name || '未命名条目' }}</div>
            <div class="wb-desc">{{ preview(entry.content) }}</div>
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
const wbName = ref(store.selectedWbName);
const wbNames = ref<string[]>([]);

const visibleUids = computed(() => store.filteredWbEntries.map(e => e.uid));
const selectedCount = computed(() => store.selectedWbEntryUids.size);
const allChecked = computed(
  () => visibleUids.value.length > 0 && visibleUids.value.every(uid => store.selectedWbEntryUids.has(uid)),
);
const indeterminate = computed(() => {
  const c = visibleUids.value.filter(uid => store.selectedWbEntryUids.has(uid)).length;
  return c > 0 && c < visibleUids.value.length;
});

function preview(content?: string) {
  const t = (content || '').replace(/\s+/g, ' ').trim();
  return t.length > 100 ? t.slice(0, 100) + '…' : t || '(空内容)';
}

async function onWbChange(name: string) {
  await store.loadWorldbook(name);
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
  store.importWbFolder = folderName;
}

function toggleEntry(uid: number) {
  const next = new Set(store.selectedWbEntryUids);
  if (next.has(uid)) next.delete(uid);
  else next.add(uid);
  store.selectedWbEntryUids = next;
}

function setEntry(uid: number, checked: boolean) {
  const next = new Set(store.selectedWbEntryUids);
  if (checked) next.add(uid);
  else next.delete(uid);
  store.selectedWbEntryUids = next;
}

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const next = new Set(store.selectedWbEntryUids);
  visibleUids.value.forEach(uid => (checked ? next.add(uid) : next.delete(uid)));
  store.selectedWbEntryUids = next;
}

async function doImport() {
  const selected = store.wbEntries.filter(e => store.selectedWbEntryUids.has(e.uid));
  if (selected.length === 0) {
    toastr.warning('请先勾选要导入的条目');
    return;
  }
  const result = await store.importEntries(
    selected.map(e => store.wbEntryToImportInput(e)),
    store.importWbFolder,
    pmChoice,
  );
  if (!result) return;
  const parts = [];
  if (result.added) parts.push(`新增 ${result.added}`);
  if (result.updated) parts.push(`覆盖 ${result.updated}`);
  if (result.skipped) parts.push(`跳过 ${result.skipped}`);
  toastr.success(`导入完成: ${parts.join(' / ')} (目标文件夹: "${store.importWbFolder}")`);
}

onMounted(() => {
  wbNames.value = getWorldbookNames();
});
</script>
