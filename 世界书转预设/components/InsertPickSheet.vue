<template>
  <div class="pm-popup-overlay" @click.self="emit('close')">
    <div class="pm-popup pm-popup-large" style="display: flex; flex-direction: column">
      <div class="pm-popup-message" style="margin-bottom: 0">
        <strong><i class="fa-solid fa-file-import"></i> 选择要插入的条目</strong>
      </div>
      <div class="pm-insert-pick-tabs-row">
        <div class="pm-tabs pm-insert-pick-tabs">
          <div class="pm-tab-btn" :class="{ active: tab === 'memo' }" @click="tab = 'memo'">从备忘录选择</div>
          <div class="pm-tab-btn" :class="{ active: tab === 'wb' }" @click="tab = 'wb'">从世界书选择</div>
        </div>
      </div>
      <div class="pm-insert-pick-actions-row">
        <div class="pm-popup-actions pm-insert-pick-actions">
          <div class="menu_button interactable pm-popup-cancel" @click="emit('close')">取消</div>
          <div class="menu_button interactable pm-popup-confirm" @click="confirm">确认插入</div>
        </div>
      </div>

      <div v-show="tab === 'memo'" style="display: flex; flex-direction: column; flex: 1; min-height: 0">
        <div class="pm-popup-subtitle" style="margin: 8px 0">支持多选，或直接勾选文件夹标题来插入整个文件夹。</div>
        <div class="pm-insert-picker" style="flex: 1; overflow-y: auto">
          <div v-if="store.memo.length === 0" class="pm-empty-state">备忘录为空，请先在备忘录管理中创建条目。</div>
          <div v-for="folder in memoFolders" :key="folder" class="pm-insert-picker-folder">
            <div class="pm-insert-picker-folder-head">
              <label class="pm-select-all" style="margin: 0">
                <input
                  type="checkbox"
                  class="pm-checkbox"
                  :checked="folderAllChecked(folder)"
                  :indeterminate.prop="folderIndeterminate(folder)"
                  @change="toggleFolder(folder, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ folder }} ({{ entriesInFolder(folder).length }})</span>
              </label>
            </div>
            <label v-for="entry in entriesInFolder(folder)" :key="entry.id" class="pm-insert-picker-item">
              <input
                v-model="selectedMemoIds"
                type="checkbox"
                class="pm-checkbox"
                :value="entry.id"
              />
              <span>{{ entry.name || '未命名条目' }}</span>
            </label>
          </div>
        </div>
      </div>

      <div v-show="tab === 'wb'" style="display: flex; flex-direction: column; flex: 1; min-height: 0">
        <div class="pm-form-group" style="margin-top: 8px; margin-bottom: 8px">
          <PmSearchableSelect v-model="wbName" :options="wbNames" placeholder="点击选择或输入搜索..." @change="loadWb" />
        </div>
        <div class="pm-list pm-wb-list pm-insert-wb-picker" style="flex: 1; overflow-y: auto">
          <div v-if="!wbName" class="pm-empty-state">请先选择一本世界书。</div>
          <div v-else-if="wbEntries.length === 0" class="pm-empty-state">该世界书为空。</div>
          <label v-for="(entry, index) in wbEntries" :key="entry.uid" class="pm-insert-picker-item" style="padding: 4px">
            <input v-model="selectedWbIndices" type="checkbox" class="pm-checkbox" :value="index" />
            <span style="flex: 1">{{ entry.name || '未命名条目' }}</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PresetPromptDraft } from '../lib/preset-draft';
import { usePresetMemoStore } from '../store';
import PmSearchableSelect from './PmSearchableSelect.vue';

const store = usePresetMemoStore();
const tab = ref<'memo' | 'wb'>('memo');
const selectedMemoIds = ref<string[]>([]);
const wbName = ref('');
const wbNames = ref<string[]>([]);
const wbEntries = ref<WorldbookEntry[]>([]);
const selectedWbIndices = ref<number[]>([]);

const emit = defineEmits<{ close: []; confirm: [drafts: PresetPromptDraft[]] }>();

const memoFolders = computed(() =>
  store.sortedFolders.filter(f => store.memo.some(e => (e.folder || '默认') === f)),
);

function entriesInFolder(folder: string) {
  return store.memo.filter(e => (e.folder || '默认') === folder);
}

function folderAllChecked(folder: string) {
  const entries = entriesInFolder(folder);
  return entries.length > 0 && entries.every(e => selectedMemoIds.value.includes(e.id));
}

function folderIndeterminate(folder: string) {
  const entries = entriesInFolder(folder);
  const c = entries.filter(e => selectedMemoIds.value.includes(e.id)).length;
  return c > 0 && c < entries.length;
}

function toggleFolder(folder: string, checked: boolean) {
  const ids = entriesInFolder(folder).map(e => e.id);
  const set = new Set(selectedMemoIds.value);
  ids.forEach(id => (checked ? set.add(id) : set.delete(id)));
  selectedMemoIds.value = [...set];
}

async function loadWb(name: string) {
  wbEntries.value = name ? (await getWorldbook(name)) || [] : [];
  selectedWbIndices.value = [];
}

function confirm() {
  const drafts: PresetPromptDraft[] = [];
  if (tab.value === 'memo') {
    if (selectedMemoIds.value.length === 0) {
      toastr.warning('请至少选择一个备忘录条目');
      return;
    }
    const selected = selectedMemoIds.value
      .map(id => store.memo.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e);
    drafts.push(...selected.map(e => store.toPresetDraftFromMemo(e)));
  } else {
    if (selectedWbIndices.value.length === 0) {
      toastr.warning('请至少选择一个世界书条目');
      return;
    }
    selectedWbIndices.value.forEach(idx => {
      const entry = wbEntries.value[idx];
      if (entry) {
        drafts.push({
          name: entry.name || '未命名条目',
          content: entry.content || '',
          enabled: true,
          role: 'system',
          position: { type: 'relative' },
        });
      }
    });
  }
  emit('confirm', drafts);
}

onMounted(() => {
  wbNames.value = getWorldbookNames();
});
</script>
