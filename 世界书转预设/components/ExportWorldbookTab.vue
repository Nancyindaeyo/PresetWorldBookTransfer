<template>
  <div id="tab-export-wb" class="pm-tab-content pm-export-layout">
    <div class="pm-export-fixed-top">
      <div class="pm-export-source-tabs">
        <div
          v-for="src in sourceTabs"
          :key="src.value"
          class="pm-export-source-btn"
          :class="{ active: store.exportSourceType === src.value }"
          @click="switchSource(src.value)"
        >
          <i class="fa-solid" :class="src.icon"></i> {{ src.label }}
        </div>
      </div>

      <div class="pm-import-toolbar-row pm-import-toolbar-actions pm-export-actions-row">
        <div class="pm-export-actions-left">
          <label class="pm-select-all">
            <input type="checkbox" class="pm-checkbox" :checked="allChecked" :indeterminate.prop="indeterminate" @change="toggleAll" />
            <span>全选</span>
          </label>
          <div class="pm-hint">已选中 {{ store.selectedExportKeys.size }} 个条目</div>
        </div>
        <div class="pm-export-actions-right">
          <div class="menu_button interactable pm-btn-export" @click="transfer('copy')">
            <i class="fa-solid fa-clone"></i> 复制到目标
          </div>
          <div class="menu_button interactable pm-btn-export pm-btn-export-move" @click="transfer('move')">
            <i class="fa-solid fa-right-left"></i> 移动到目标
          </div>
        </div>
      </div>

      <div class="pm-export-search-merge-row">
        <PmSearchBox v-model="store.exportSearchKeyword" placeholder="按条目名/内容搜索..." compact />
        <div class="pm-export-target-inline">
          <label>目标</label>
          <PmSearchableSelect
            v-model="store.exportTargetWb"
            :options="wbNames"
            placeholder="世界书名称..."
            allow-custom
          />
        </div>
      </div>
    </div>

    <div class="pm-export-drawer" :class="{ 'is-open': store.exportDrawerOpen }">
      <div
        class="pm-export-drawer-toggle menu_button interactable"
        title="展开批量设置与源世界书"
        @click="store.exportDrawerOpen = !store.exportDrawerOpen"
      >
        <i class="fa-solid fa-chevron-right pm-export-drawer-chevron"></i>
        <span>批量设置 / 源世界书</span>
      </div>
      <div v-show="store.exportDrawerOpen" class="pm-export-drawer-body">
        <div v-if="store.exportSourceType === 'memo'" class="pm-folders-bar pm-export-folders-bar">
          <div
            v-for="folder in store.sortedFolders"
            :key="folder"
            class="pm-folder-tab"
            :class="{ active: store.exportMemoFolder === folder }"
            @click="selectMemoFolder(folder)"
          >
            <i class="fa-solid fa-folder folder-icon"></i>
            <span class="folder-name">{{ folder }}</span>
          </div>
        </div>
        <div v-if="store.exportSourceType === 'worldbook'" class="pm-import-toolbar-row pm-export-source-wb-row">
          <label>源世界书</label>
          <PmSearchableSelect
            v-model="store.exportSourceWbName"
            :options="wbNames"
            placeholder="选择源世界书..."
            style="flex: 1; min-width: 0"
            @change="store.loadExportSourceWb"
          />
        </div>
        <div class="pm-export-batch-block">
          <div class="pm-export-batch-row pm-export-batch-row-main">
            <span class="pm-export-batch-label">批量</span>
            <div class="pm-export-batch-row-fields">
              <select v-model="store.exportBatch.strategy" class="pm-field-input">
                <option value="">蓝/绿</option>
                <option v-for="o in strategyOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <input
                v-model="store.exportBatch.order"
                type="number"
                class="pm-field-input pm-export-batch-order"
                placeholder="顺序"
                min="0"
                step="1"
              />
              <select v-model="store.exportBatch.position" class="pm-field-input">
                <option value="">插入位置…</option>
                <option v-for="o in positionOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <span v-if="store.exportBatch.position === 'at_depth'" class="pm-export-batch-depth-wrap">
                <input
                  v-model="store.exportBatch.depth"
                  type="number"
                  class="pm-field-input pm-export-batch-depth"
                  placeholder="深度"
                  min="0"
                  step="1"
                />
              </span>
            </div>
          </div>
          <div class="pm-export-batch-row pm-export-batch-row-extra">
            <label class="pm-export-batch-check">
              <input v-model="store.exportBatch.preventIn" type="checkbox" class="pm-checkbox" /> 不可递归
            </label>
            <label class="pm-export-batch-check">
              <input v-model="store.exportBatch.preventOut" type="checkbox" class="pm-checkbox" /> 防进一步
            </label>
          </div>
          <div class="pm-export-batch-apply-row">
            <div class="menu_button interactable pm-btn pm-export-batch-apply-btn" @click="applyBatch">
              <i class="fa-solid fa-wand-magic-sparkles"></i> 修改
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="pm-list pm-wb-list pm-export-list-scroll">
      <div v-if="emptyMessage" class="pm-empty-state">{{ emptyMessage }}</div>
      <ExportEntryCard
        v-for="draft in store.filteredExportDrafts"
        :key="draft.sourceKey"
        :draft="draft"
        :checked="store.selectedExportKeys.has(draft.sourceKey)"
        :highlighted="highlightKey === draft.sourceKey || highlightPresetIndex === draft.presetIndex"
        @toggle="toggleDraft(draft.sourceKey)"
        @update="patch => updateDraft(draft.sourceKey, patch)"
        @expand="openExportExpand(draft)"
      />
    </div>

    <PmHtmlConfirmSheet
      v-if="dupConfirmVisible"
      :body-html="dupConfirmHtml"
      confirm-label="确定追加"
      cancel-label="取消"
      @confirm="onDupConfirm"
      @cancel="onDupCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  EXPORT_POSITION_OPTIONS,
  EXPORT_STRATEGY_OPTIONS,
  renderExportDuplicateConfirmHtml,
  type ExportWbDraft,
  type ExportWbSourceType,
} from '../export-wb';
import { usePresetMemoStore } from '../store';
import ExportEntryCard from './ExportEntryCard.vue';
import PmHtmlConfirmSheet from './PmHtmlConfirmSheet.vue';
import PmSearchBox from './PmSearchBox.vue';
import PmSearchableSelect from './PmSearchableSelect.vue';

const store = usePresetMemoStore();
const dupConfirmVisible = ref(false);
const dupConfirmHtml = ref('');
let dupConfirmResolve: ((ok: boolean) => void) | null = null;
const wbNames = ref<string[]>([]);
const highlightKey = ref<string | null>(null);
const highlightPresetIndex = ref<number | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

const emit = defineEmits<{
  'expand-draft': [
    payload: {
      name: string;
      content: string;
      sourceType: ExportWbSourceType;
      sourceKey: string;
      presetIndex?: number;
      onApply: (c: string) => void;
    },
  ];
}>();

const sourceTabs = [
  { value: 'preset' as ExportWbSourceType, label: '当前预设', icon: 'fa-sliders' },
  { value: 'memo' as ExportWbSourceType, label: '备忘录', icon: 'fa-note-sticky' },
  { value: 'worldbook' as ExportWbSourceType, label: '世界书', icon: 'fa-book' },
];

const strategyOptions = EXPORT_STRATEGY_OPTIONS;
const positionOptions = EXPORT_POSITION_OPTIONS.filter(o => o.value !== 'outlet');

const visibleKeys = computed(() => store.filteredExportDrafts.map(d => d.sourceKey));
const allChecked = computed(
  () => visibleKeys.value.length > 0 && visibleKeys.value.every(k => store.selectedExportKeys.has(k)),
);
const indeterminate = computed(() => {
  const c = visibleKeys.value.filter(k => store.selectedExportKeys.has(k)).length;
  return c > 0 && c < visibleKeys.value.length;
});

const emptyMessage = computed(() => {
  if (store.exportSourceType === 'preset' && store.exportDrafts.length === 0) return '当前预设为空。';
  if (store.exportSourceType === 'memo') {
    const memo = store.memo.filter(e => (e.folder || '默认') === store.exportMemoFolder);
    if (memo.length === 0) return `文件夹「${store.exportMemoFolder}」为空。`;
  }
  if (store.exportSourceType === 'worldbook') {
    if (!store.exportSourceWbName) return '请先在抽屉中选择源世界书。';
    if (store.exportWbEntriesCache.length === 0) return '该世界书为空。';
  }
  return '';
});

function switchSource(type: ExportWbSourceType) {
  store.switchExportSource(type);
}

function selectMemoFolder(folder: string) {
  store.selectExportMemoFolder(folder);
}

function toggleDraft(key: string) {
  const next = new Set(store.selectedExportKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  store.selectedExportKeys = next;
}

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const next = new Set(store.selectedExportKeys);
  visibleKeys.value.forEach(k => (checked ? next.add(k) : next.delete(k)));
  store.selectedExportKeys = next;
}

function updateDraft(key: string, patch: Partial<ExportWbDraft>) {
  const idx = store.exportDrafts.findIndex(d => d.sourceKey === key);
  if (idx !== -1) store.exportDrafts[idx] = { ...store.exportDrafts[idx], ...patch };
}

function applyBatch() {
  const count = store.applyExportBatch();
  if (count === 0) {
    toastr.warning(store.selectedExportKeys.size === 0 ? '请先勾选要批量修改的条目' : '请先设置要批量应用的字段');
    return;
  }
  toastr.success(`已批量更新 ${count} 个条目`);
}

async function transfer(mode: 'copy' | 'move') {
  try {
    await runTransfer(mode, false);
  } catch (e) {
    handleTransferError(e, mode);
  }
}

async function runTransfer(mode: 'copy' | 'move', skipDuplicateCheck: boolean) {
  const result = await store.runExportTransfer(mode, skipDuplicateCheck);
  const action = mode === 'move' ? '移动' : '复制';
  toastr.success(`已${action} ${result.count} 个条目到世界书「${result.targetWbName}」`);
  store.reloadFromVars();
  store.refreshExportDrafts();
}

function openDupConfirm(html: string): Promise<boolean> {
  return new Promise(resolve => {
    dupConfirmHtml.value = html;
    dupConfirmResolve = resolve;
    dupConfirmVisible.value = true;
  });
}

function onDupConfirm() {
  dupConfirmVisible.value = false;
  dupConfirmResolve?.(true);
  dupConfirmResolve = null;
}

function onDupCancel() {
  dupConfirmVisible.value = false;
  dupConfirmResolve?.(false);
  dupConfirmResolve = null;
}

async function handleTransferError(e: unknown, mode: 'copy' | 'move') {
  const msg = String((e as Error)?.message ?? e);
  if (msg.startsWith('DUPLICATE_NAMES:')) {
    const names = msg.slice('DUPLICATE_NAMES:'.length).split('\n').filter(Boolean);
    const html = renderExportDuplicateConfirmHtml(names);
    if (await openDupConfirm(html)) {
      try {
        await runTransfer(mode, true);
      } catch (err) {
        console.error(err);
        toastr.error('操作失败，请查看控制台');
      }
    }
    return;
  }
  if (msg === 'NO_TARGET') toastr.warning('请输入或选择目标世界书名称');
  else if (msg === 'NO_SOURCE_WB') toastr.warning('请先选择源世界书');
  else if (msg === 'SAME_SOURCE_TARGET') toastr.warning('移动时源世界书与目标世界书不能相同');
  else if (msg === 'NO_DRAFTS') toastr.warning('请先勾选要导出的条目');
  else {
    console.error(e);
    toastr.error('操作失败，请查看控制台');
  }
}

function openExportExpand(draft: ExportWbDraft) {
  emit('expand-draft', {
    name: draft.name || '导出条目',
    content: draft.content,
    sourceType: draft.sourceType,
    sourceKey: draft.sourceKey,
    presetIndex: draft.presetIndex,
    onApply: content => updateDraft(draft.sourceKey, { content }),
  });
}

function jumpToExportPrompt(index: number) {
  let draft = store.exportDrafts.find(d => d.presetIndex === index);
  if (!draft) draft = store.exportDrafts.find(d => d.sourceKey === String(index));
  if (!draft) {
    toastr.warning('未找到对应条目，列表可能已变更');
    return;
  }

  store.exportSearchKeyword = '';
  highlightKey.value = draft.sourceKey;
  highlightPresetIndex.value = draft.presetIndex ?? null;

  const el = document.querySelector(
    `#tab-export-wb .wb-entry-item[data-source-key="${draft.sourceKey}"]`,
  );
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightKey.value = null;
    highlightPresetIndex.value = null;
    highlightTimer = null;
  }, 3000);
}

async function onJumpExportEvent(e: Event) {
  const idx = (e as CustomEvent<number>).detail;
  if (typeof idx !== 'number') return;
  store.switchTab('tab-export-wb');
  if (store.exportSourceType !== 'preset') {
    store.switchExportSource('preset');
  }
  await nextTick();
  jumpToExportPrompt(idx);
}

onMounted(() => {
  wbNames.value = getWorldbookNames();
  window.addEventListener('preset-memo-jump-export', onJumpExportEvent);
});

onUnmounted(() => {
  window.removeEventListener('preset-memo-jump-export', onJumpExportEvent);
  if (highlightTimer) clearTimeout(highlightTimer);
});
</script>
