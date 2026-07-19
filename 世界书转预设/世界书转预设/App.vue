<template>
  <div ref="pmRootRef" class="pm-root" @click.stop>
    <header class="pm-header">
      <div class="pm-header-main">
        <h2 class="pm-title"><i class="fa-solid fa-book-bookmark"></i> 预设备忘录</h2>
        <div class="pm-version-row">
          <span class="pm-version-badge" aria-hidden="true">v{{ PM_DISPLAY_VERSION }}</span>
          <button
            v-if="hasUpdate"
            type="button"
            class="pm-version-update interactable"
            :class="{ 'is-busy': updatingExtension }"
            :disabled="updatingExtension"
            title="发现扩展更新，点击一键更新并刷新酒馆"
            @click="onApplyUpdate"
          >
            <i class="fa-solid fa-circle-up" aria-hidden="true"></i>
            {{ updatingExtension ? '更新中…' : '有更新' }}
          </button>
        </div>
      </div>
      <div id="pm-fab-container" class="pm-header-toolbar">
        <div class="pm-header-toolbar-menu">
          <div
            v-if="store.activeTab === 'tab-insert'"
            id="preset-memo-insert-save-btn"
            class="menu_button interactable pm-header-tool-btn"
            :class="{ 'is-dirty': store.insertDraftDirty, 'is-disabled': !store.insertDraftDirty }"
            title="保存预设"
            @click="saveInsertDraft"
          >
            <i class="fa-solid fa-floppy-disk"></i>
          </div>
          <div class="menu_button interactable pm-header-tool-btn" title="快捷插入管理" @click="showShortcuts = true">
            <i class="fa-solid fa-keyboard"></i>
          </div>
          <div class="menu_button interactable pm-header-tool-btn" title="导出全部备忘录为 JSON" @click="exportJson">
            <i class="fa-solid fa-file-export"></i>
          </div>
          <div class="menu_button interactable pm-header-tool-btn" title="从 JSON 导入备忘录" @click="importJson">
            <i class="fa-solid fa-file-import"></i>
          </div>
          <div class="menu_button interactable pm-header-tool-btn" title="主题与配色" @click="showTheme = true">
            <i class="fa-solid fa-palette"></i>
          </div>
          <div class="menu_button interactable pm-header-tool-btn" title="关闭" @click="handleClose">
            <i class="fa-solid fa-xmark"></i>
          </div>
        </div>
      </div>
    </header>

    <div class="pm-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="pm-tab-btn"
        :class="{ active: store.activeTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        <i class="fa-solid" :class="tab.icon"></i> {{ tab.label }}
      </div>
    </div>

    <div class="pm-content-area" :class="{ 'pm-content-area--flex-pane': flexPane }">
      <KeepAlive :max="5">
        <MemoTab
          v-if="store.hydrated && store.activeTab === 'tab-memo'"
          key="tab-memo"
          @expand-content="openMemoExpand"
        />
        <div v-else-if="store.activeTab === 'tab-memo'" key="tab-memo-loading" class="pm-empty-state pm-hint">
          加载备忘录…
        </div>
        <ImportWorldbookTab v-else-if="store.activeTab === 'tab-import'" key="tab-import" />
        <ImportPresetTab v-else-if="store.activeTab === 'tab-import-preset'" key="tab-import-preset" />
        <InsertPresetTab
          v-else-if="store.activeTab === 'tab-insert'"
          key="tab-insert"
          @expand-draft="openDraftExpand"
        />
        <ExportWorldbookTab
          v-else-if="store.activeTab === 'tab-export-wb'"
          key="tab-export-wb"
          @expand-draft="openExportExpand"
        />
      </KeepAlive>
    </div>

    <ExpandedEditorSheet
      v-if="expandedEditor"
      :title="expandedEditor.title"
      :content="expandedEditor.content"
      :shortcuts="store.shortcuts"
      :preset-var-lint="expandedEditor.presetVarLint"
      @apply="onExpandedApply"
      @cancel="closeExpandedEditor"
      @open-shortcuts="showShortcuts = true"
    />

    <ThemeCustomizerSheet v-if="showTheme" @close="showTheme = false" />
    <ShortcutsEditorSheet v-if="showShortcuts" @close="showShortcuts = false" @saved="onShortcutsSaved" />

    <InsertSaveSummarySheet
      v-if="saveSummaryVisible"
      :summary="saveSummaryData"
      @confirm="onSaveSummaryConfirm"
      @cancel="onSaveSummaryCancel"
    />

    <PmDialogHost />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { usePmDialog } from './composables/usePmDialog';
import { provideExpandedEditor } from './composables/useExpandedEditor';
import { useMobileLayout, useKeyboardInset } from './composables/useMobileLayout';
import { usePanelPmInput } from './composables/usePanelPmInput';
import type { ExportWbSourceType } from './export-wb';
import { applyPresetMemoUpdate, checkPresetMemoUpdate } from './lib/version-check';
import { PM_DISPLAY_VERSION } from './version';
import { applyPmThemeToModal } from './lib/pm-theme-modal';
import type { InsertSaveSummary } from './lib/insert-save-summary';
import { usePresetMemoStore } from './store';
import type { MemoEntry, PmTabId } from './schema';
import MemoTab from './components/MemoTab.vue';
import ImportWorldbookTab from './components/ImportWorldbookTab.vue';
import ImportPresetTab from './components/ImportPresetTab.vue';
import InsertPresetTab from './components/InsertPresetTab.vue';
import ExportWorldbookTab from './components/ExportWorldbookTab.vue';
import PmDialogHost from './components/PmDialogHost.vue';

const ExpandedEditorSheet = defineAsyncComponent(() => import('./components/ExpandedEditorSheet.vue'));
const ThemeCustomizerSheet = defineAsyncComponent(() => import('./components/ThemeCustomizerSheet.vue'));
const ShortcutsEditorSheet = defineAsyncComponent(() => import('./components/ShortcutsEditorSheet.vue'));
const InsertSaveSummarySheet = defineAsyncComponent(() => import('./components/InsertSaveSummarySheet.vue'));

const props = defineProps<{ onClose?: () => void }>();

const store = usePresetMemoStore();
const { pmChoice } = usePmDialog();
const { state: expandedEditor, openExpandedEditor, closeExpandedEditor } = provideExpandedEditor();

watch(
  () => store.themeSettings,
  s => applyPmThemeToModal(s),
  { deep: true },
);

function onPanelOpen() {
  applyPmThemeToModal(store.themeSettings, true);
  scheduleUpdateChecks();
}

const hasUpdate = ref(false);
const updatingExtension = ref(false);

const UPDATE_CHECK_MAX_ATTEMPTS = 4;
const UPDATE_CHECK_BASE_MS = 2000;
let updateCheckAttempt = 0;
let updateCheckTimer: ReturnType<typeof setTimeout> | null = null;

function clearUpdateCheckSchedule() {
  if (updateCheckTimer !== null) {
    clearTimeout(updateCheckTimer);
    updateCheckTimer = null;
  }
}

async function runUpdateCheckWithBackoff() {
  const result = await checkPresetMemoUpdate();
  if (result.ok) {
    hasUpdate.value = result.hasUpdate;
    updateCheckAttempt = 0;
    return;
  }
  if (updateCheckAttempt >= UPDATE_CHECK_MAX_ATTEMPTS) return;
  const delay = UPDATE_CHECK_BASE_MS * 2 ** updateCheckAttempt;
  updateCheckAttempt += 1;
  updateCheckTimer = globalThis.setTimeout(() => void runUpdateCheckWithBackoff(), delay);
}

function scheduleUpdateChecks() {
  clearUpdateCheckSchedule();
  updateCheckAttempt = 0;
  void runUpdateCheckWithBackoff();
}

function onExtensionSettingsLoaded() {
  scheduleUpdateChecks();
}

async function onApplyUpdate() {
  if (updatingExtension.value) return;
  updatingExtension.value = true;
  try {
    const result = await applyPresetMemoUpdate();
    if (!result.ok) {
      toastr.error(result.message ?? '扩展更新失败');
      updatingExtension.value = false;
      return;
    }
    hasUpdate.value = false;
  } catch (e) {
    console.error(e);
    toastr.error('扩展更新失败，请查看控制台');
    updatingExtension.value = false;
  }
}

const pmRootRef = ref<HTMLElement | null>(null);
const showTheme = ref(false);
const showShortcuts = ref(false);

const saveSummaryVisible = ref(false);
const saveSummaryData = ref<InsertSaveSummary>({ added: [], deleted: [], enabled: [], disabled: [] });
let saveSummaryResolve: ((ok: boolean) => void) | null = null;

const tabs: { id: PmTabId; label: string; icon: string }[] = [
  { id: 'tab-memo', label: '备忘录管理', icon: 'fa-list' },
  { id: 'tab-import', label: '从世界书导入', icon: 'fa-download' },
  { id: 'tab-import-preset', label: '从预设导入', icon: 'fa-file-import' },
  { id: 'tab-insert', label: '插入到当前预设', icon: 'fa-arrow-right-to-bracket' },
  { id: 'tab-export-wb', label: '导出到世界书', icon: 'fa-upload' },
];

const flexTabs = new Set<PmTabId>(['tab-memo', 'tab-import', 'tab-import-preset', 'tab-insert', 'tab-export-wb']);
const flexPane = computed(() => flexTabs.has(store.activeTab));

function switchTab(tabId: PmTabId) {
  if (store.activeTab === tabId) return;
  store.switchTab(tabId);
}

function handleClose() {
  void closeWithGuard();
}

async function closeWithGuard() {
  if (store.insertDraftDirty) {
    const choice = await pmChoice<'save' | 'discard'>(
      '检测到您在 "插入到当前预设" 选项卡中有未保存的修改。\n\n是否保存这些修改并关闭？',
      [
        { label: '保存并关闭', value: 'save', variant: 'primary' },
        { label: '放弃修改', value: 'discard', variant: 'danger' },
      ],
    );
    if (choice === null) return;
    if (choice === 'save') {
      if (!(await confirmAndSaveInsertDraft())) return;
    } else {
      store.resetInsertDraft();
    }
  }
  props.onClose?.();
}

function pmConfirmInsertDraftSave(summary: InsertSaveSummary): Promise<boolean> {
  return new Promise(resolve => {
    saveSummaryData.value = summary;
    saveSummaryResolve = resolve;
    saveSummaryVisible.value = true;
  });
}

function onSaveSummaryConfirm() {
  saveSummaryVisible.value = false;
  saveSummaryResolve?.(true);
  saveSummaryResolve = null;
}

function onSaveSummaryCancel() {
  saveSummaryVisible.value = false;
  saveSummaryResolve?.(false);
  saveSummaryResolve = null;
}

async function confirmAndSaveInsertDraft(): Promise<boolean> {
  const summary = store.getInsertSaveSummary();
  if (!(await pmConfirmInsertDraftSave(summary))) return false;
  try {
    await store.saveInsertDraft();
    const presetName = getLoadedPresetName()?.trim();
    toastr.success(presetName ? `预设已保存，并已同步到「${presetName}」` : '预设已保存到当前会话');
    return true;
  } catch (e) {
    console.error(e);
    toastr.error('保存失败，请查看控制台');
    return false;
  }
}

async function saveInsertDraft() {
  if (!store.insertDraftDirty) return;
  await confirmAndSaveInsertDraft();
}

function exportJson() {
  const data = store.exportJson();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.download = `预设备忘录_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toastr.success('已导出 JSON 文件');
}

function importJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const choice = await pmChoice<'merge' | 'replace'>(
        `即将导入备忘录数据\n\n采用哪种方式？`,
        [
          { label: '合并', value: 'merge', variant: 'primary' },
          { label: '覆盖 (危险)', value: 'replace', variant: 'danger' },
        ],
      );
      if (choice === null) return;
      const summary = store.importJson(data, choice);
      applyPmThemeToModal(store.themeSettings, true);
      toastr.success(
        `导入完成：${summary.memoCount} 条 memo、${summary.folderCount} 个文件夹` +
          (summary.mergedShortcuts ? '，已同步快捷插入' : '') +
          (summary.mergedTheme ? '，已同步主题' : '') +
          (summary.mergedUiState ? '，已恢复界面状态' : ''),
      );
    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.message === 'INVALID_MEMO') {
        toastr.error('JSON 中的 memo 字段格式无效');
      } else {
        toastr.error('JSON 解析失败, 请检查文件格式');
      }
    }
  };
  input.click();
}

function openMemoExpand(entry: MemoEntry) {
  openExpandedEditor({
    title: entry.name || '编辑条目',
    content: entry.content,
    onApply: content => store.updateMemoEntry(entry.id, { content }),
  });
}

function openDraftExpand(index: number) {
  const p = store.insertDraftPrompts?.[index];
  if (!p) return;
  store.ensureInsertDraftLoaded();
  void import('./lib/preset-var-lint-entries').then(({ buildInsertDraftVarLintEntries }) => {
    openExpandedEditor({
      title: p.name || '草稿条目',
      content: p.content,
      onApply: content => {
        p.content = content;
        store.insertDraftDirty = true;
      },
      presetVarLint: {
        getEntries: live => buildInsertDraftVarLintEntries(store.insertDraftPrompts ?? [], index, live),
        currentIndex: index,
        onJumpToEntry: idx => {
          window.dispatchEvent(new CustomEvent('preset-memo-jump-insert', { detail: idx }));
        },
      },
    });
  });
}

function openExportExpand(payload: {
  name: string;
  content: string;
  sourceType: ExportWbSourceType;
  sourceKey: string;
  presetIndex?: number;
  onApply: (c: string) => void;
}) {
  const presetIndex = payload.presetIndex;
  const base = {
    title: payload.name,
    content: payload.content,
    onApply: payload.onApply,
  };
  if (payload.sourceType === 'preset' && presetIndex != null) {
    void import('./lib/preset-var-lint-entries').then(({ buildExportPresetVarLintEntries }) => {
      openExpandedEditor({
        ...base,
        presetVarLint: {
          getEntries: live => buildExportPresetVarLintEntries(presetIndex, live),
          currentIndex: presetIndex,
          onJumpToEntry: idx => {
            window.dispatchEvent(new CustomEvent('preset-memo-jump-export', { detail: idx }));
          },
        },
      });
    });
    return;
  }
  openExpandedEditor(base);
}

function onExpandedApply(content: string) {
  expandedEditor.value?.onApply(content);
  closeExpandedEditor();
}

function onShortcutsSaved() {
  /* 快捷条在 ExpandedEditorSheet 内通过 props 自动更新 */
}

function onRequestClose() {
  void closeWithGuard();
}

usePanelPmInput(pmRootRef);
useKeyboardInset(pmRootRef);

let extensionSettingsLoadedOff: EventOnReturn | null = null;

window.addEventListener('preset-memo-request-close', onRequestClose);
window.addEventListener('preset-memo-panel-open', onPanelOpen);

onMounted(() => {
  scheduleUpdateChecks();
  extensionSettingsLoadedOff = eventOn(tavern_events.EXTENSION_SETTINGS_LOADED, onExtensionSettingsLoaded);
});

onUnmounted(() => {
  clearUpdateCheckSchedule();
  window.removeEventListener('preset-memo-request-close', onRequestClose);
  window.removeEventListener('preset-memo-panel-open', onPanelOpen);
  extensionSettingsLoadedOff?.stop();
  extensionSettingsLoadedOff = null;
});
</script>
