<template>
  <div id="tab-memo" class="pm-tab-content">
    <div class="pm-folders-section" :class="{ 'is-open': foldersBarOpen }">
      <div
        class="pm-folders-toggle menu_button interactable"
        title="展开或收起文件夹列表"
        @click="toggleFoldersBar"
      >
        <i class="fa-solid fa-folder"></i>
        <span class="pm-folders-toggle-label">文件夹</span>
        <span class="pm-folders-toggle-current">{{ store.currentFolder }}</span>
        <span class="pm-folders-toggle-meta">{{ store.currentFolderMemo.length }} 条</span>
        <i class="fa-solid fa-chevron-down pm-folders-toggle-chevron" aria-hidden="true"></i>
      </div>
      <div v-show="foldersBarOpen" ref="foldersBarRef" class="pm-folders-bar">
        <div
          v-for="folder in store.sortedFolders"
          :key="folder"
          class="pm-folder-tab"
          :class="{
            active: store.currentFolder === folder,
            'is-pinned': !!store.folderMeta[folder]?.pinned,
          }"
          :data-folder="folder"
          @click="onFolderClick(folder, $event)"
        >
          <i
            class="fa-solid folder-icon"
            :class="store.folderMeta[folder]?.pinned ? 'fa-thumbtack' : 'fa-folder'"
          ></i>
          <span class="folder-name">{{ folder }}</span>
          <template v-if="folder !== '默认'">
            <i
              class="fa-solid fa-thumbtack folder-pin"
              :class="{ 'is-pinned': store.folderMeta[folder]?.pinned }"
              :title="store.folderMeta[folder]?.pinned ? '取消置顶' : '置顶'"
              @click.stop="togglePin(folder)"
            ></i>
            <i class="fa-solid fa-pen folder-edit" title="重命名文件夹" @click.stop="renameFolder(folder)"></i>
            <i class="fa-solid fa-xmark folder-delete" title="删除文件夹" @click.stop="deleteFolder(folder)"></i>
          </template>
        </div>
        <div class="pm-folder-tab pm-folder-new" style="border-style: dashed" @click="newFolder">
          <i class="fa-solid fa-plus"></i> 新建文件夹
        </div>
      </div>
    </div>

    <div class="pm-toolbar-section" :class="{ 'is-open': toolbarOpen }">
      <div
        class="pm-toolbar-toggle menu_button interactable"
        title="展开或收起工具栏"
        @click="toggleToolbar"
      >
        <i class="fa-solid fa-sliders"></i>
        <span class="pm-toolbar-toggle-label">工具栏</span>
        <span v-if="store.searchKeyword.trim()" class="pm-toolbar-toggle-meta">
          搜索「{{ store.searchKeyword.trim() }}」
        </span>
        <span v-else-if="store.selectedMemoIds.size > 0" class="pm-toolbar-toggle-meta">
          已选 {{ store.selectedMemoIds.size }} 条
        </span>
        <span v-else class="pm-toolbar-toggle-meta">全选 / 搜索 / 批量</span>
        <i class="fa-solid fa-chevron-down pm-toolbar-toggle-chevron" aria-hidden="true"></i>
      </div>
      <div v-show="toolbarOpen" class="pm-toolbar">
        <label class="pm-select-all" title="全选 / 反选当前文件夹的条目">
          <input
            type="checkbox"
            class="pm-checkbox"
            :checked="allChecked"
            :indeterminate.prop="indeterminate"
            @change="toggleSelectAll"
          />
          <span>全选</span>
        </label>
        <PmSearchBox v-model="store.searchKeyword" placeholder="按条目名/内容搜索..." />
        <div class="pm-toolbar-actions">
          <select
            v-model="batchMoveTarget"
            class="text_pole"
            style="padding: 4px 8px; border-radius: 4px; height: 32px"
            @change="onBatchMove"
          >
            <option value="">批量移动到...</option>
            <option v-for="f in batchMoveFolders" :key="f" :value="f">{{ f }}</option>
          </select>
          <div
            class="menu_button interactable pm-btn pm-btn-danger"
            style="height: 32px; box-sizing: border-box"
            @click="batchDelete"
          >
            <i class="fa-solid fa-trash"></i> 删除
          </div>
          <div
            class="menu_button interactable pm-btn pm-btn-success"
            style="height: 32px; box-sizing: border-box"
            title="在当前文件夹新建空白条目"
            @click="newEntry"
          >
            <i class="fa-solid fa-file-circle-plus"></i> 新建条目
          </div>
        </div>
      </div>
    </div>

    <div
      ref="listRef"
      id="preset-memo-list"
      class="pm-list"
      @focusin.capture="onListFocusInCapture"
      @focusin="onListFocusIn"
    >
      <div v-if="store.currentFolderMemo.length === 0" class="pm-empty-state">
        {{ emptyTip }}
      </div>
      <div v-else-if="store.filteredMemoEntries.length === 0" class="pm-empty-state pm-search-empty-hint">
        没有匹配的条目
      </div>
      <div
        v-for="entry in store.filteredMemoEntries"
        :key="entry.id"
        class="memo-entry-item"
        :class="{ 'is-expanded': store.expandedMemoIds.has(entry.id) }"
        :data-id="entry.id"
      >
        <div class="memo-header">
          <div class="memo-left">
            <i class="fa-solid fa-grip-vertical memo-drag-handle" title="拖拽排序"></i>
            <input
              type="checkbox"
              class="memo-entry-checkbox pm-checkbox"
              :checked="store.selectedMemoIds.has(entry.id)"
              @change="toggleSelect(entry.id, ($event.target as HTMLInputElement).checked)"
            />
            <i class="fa-solid fa-chevron-right memo-toggle" @click="toggleMemoExpand(entry.id)"></i>
            <PmStableField
              :model-value="entry.name"
              field-class="memo-entry-name"
              @change="v => updateName(entry.id, v)"
            />
          </div>
          <div class="memo-right">
            <select
              class="text_pole memo-entry-folder"
              :value="entry.folder || '默认'"
              title="所属文件夹"
              @change="updateFolder(entry.id, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="f in store.folders" :key="f" :value="f">{{ f }}</option>
            </select>
            <select
              class="text_pole memo-entry-role"
              :value="entry.role"
              @change="updateRole(entry.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="system">System</option>
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
            </select>
            <div
              class="menu_button memo-entry-expand pm-content-expand-btn pm-icon-btn interactable"
              title="全屏编辑"
              @click="emit('expand-content', entry)"
            >
              <i class="fa-solid fa-expand"></i>
            </div>
            <div class="menu_button memo-entry-copy pm-icon-btn interactable" title="复制条目" @click="copyEntry(entry.id)">
              <i class="fa-solid fa-copy"></i>
            </div>
            <div
              class="menu_button memo-entry-delete pm-icon-btn pm-icon-btn-danger interactable"
              title="删除"
              @click="deleteEntry(entry)"
            >
              <i class="fa-solid fa-trash"></i>
            </div>
          </div>
        </div>
        <div class="memo-preview">{{ previewText(entry.content) }}</div>
        <PmStableField
          :model-value="entry.content"
          multiline
          field-class="memo-entry-content"
          @change="v => updateContent(entry.id, v)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getTavernWindow } from '@util/tavern-autocomplete';
import { usePmDialog } from '../composables/usePmDialog';
import {
  getKeyboardInset,
  isKeyboardLikelyOpen,
  pinMemoScrollState,
  restorePinnedScrollState,
  scheduleScrollMemoFieldIfNeeded,
  scrollMemoFieldIfNeeded,
} from '../lib/memo-keyboard-scroll';
import { loadFoldersBarOpen, loadMemoToolbarOpen, saveFoldersBarOpen, saveMemoToolbarOpen } from '../lib/script-vars';
import { usePresetMemoStore } from '../store';
import type { MemoEntry } from '../schema';
import PmSearchBox from './PmSearchBox.vue';
import PmStableField from './PmStableField.vue';

const store = usePresetMemoStore();
const { pmConfirm, pmPrompt } = usePmDialog();
const listRef = ref<HTMLElement | null>(null);
const foldersBarRef = ref<HTMLElement | null>(null);
const isMobileLayout = window.matchMedia('(max-width: 1024px)').matches;
const foldersBarOpen = ref(loadFoldersBarOpen(!isMobileLayout));
const toolbarOpen = ref(loadMemoToolbarOpen(!isMobileLayout));
const batchMoveTarget = ref('');

function toggleFoldersBar() {
  foldersBarOpen.value = !foldersBarOpen.value;
  saveFoldersBarOpen(foldersBarOpen.value);
  if (foldersBarOpen.value) {
    setTimeout(initFolderSortable, 50);
  }
}

function toggleToolbar() {
  toolbarOpen.value = !toolbarOpen.value;
  saveMemoToolbarOpen(toolbarOpen.value);
}

const emit = defineEmits<{ 'expand-content': [entry: MemoEntry] }>();

const batchMoveFolders = computed(() => store.folders.filter(f => f !== store.currentFolder));

const visibleIds = computed(() => store.filteredMemoEntries.map(e => e.id));

const allChecked = computed(
  () => visibleIds.value.length > 0 && visibleIds.value.every(id => store.selectedMemoIds.has(id)),
);

const indeterminate = computed(() => {
  const checked = visibleIds.value.filter(id => store.selectedMemoIds.has(id)).length;
  return checked > 0 && checked < visibleIds.value.length;
});

const emptyTip = computed(() => {
  if (store.memo.length === 0) return '当前文件夹为空。';
  return `当前文件夹「${store.currentFolder}」为空, 其它文件夹共有 ${store.memo.length} 条。请切换上方文件夹标签。`;
});

function previewText(content: string) {
  const t = (content || '').replace(/\s+/g, ' ').trim();
  return t.length > 120 ? t.slice(0, 120) + '…' : t || '(空内容)';
}

function onFolderClick(folder: string, e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.folder-pin, .folder-edit, .folder-delete')) return;
  store.setCurrentFolder(folder);
}

async function togglePin(folder: string) {
  const m = { ...store.folderMeta };
  if (m[folder]?.pinned) delete m[folder];
  else m[folder] = { ...(m[folder] || {}), pinned: true };
  store.folderMeta = m;
  store.persistFolderMeta();
  toastr.success(m[folder]?.pinned ? '已置顶' : '已取消置顶');
}

async function renameFolder(folder: string) {
  const newName = await pmPrompt('请输入新的文件夹名称:', folder);
  if (!newName?.trim() || newName.trim() === folder) return;
  const trimmed = newName.trim();
  if (store.folders.includes(trimmed)) {
    toastr.warning('文件夹名已存在');
    return;
  }
  const idx = store.folders.indexOf(folder);
  if (idx !== -1) store.folders[idx] = trimmed;
  store.persistFolders();
  const m = { ...store.folderMeta };
  if (m[folder]) {
    m[trimmed] = m[folder];
    delete m[folder];
    store.folderMeta = m;
    store.persistFolderMeta();
  }
  store.memo.forEach(e => {
    if (e.folder === folder) e.folder = trimmed;
  });
  store.persistMemo();
  if (store.currentFolder === folder) store.setCurrentFolder(trimmed);
  toastr.success('已重命名文件夹');
}

async function deleteFolder(folder: string) {
  if (!(await pmConfirm(`确定要删除文件夹 "${folder}" 吗？\n其中的条目将被移动到"默认"文件夹。`))) return;
  store.memo.forEach(e => {
    if (e.folder === folder) e.folder = '默认';
  });
  store.persistMemo();
  store.folders = store.folders.filter(f => f !== folder);
  store.persistFolders();
  const m = { ...store.folderMeta };
  delete m[folder];
  store.folderMeta = m;
  store.persistFolderMeta();
  if (store.currentFolder === folder) store.setCurrentFolder('默认');
  toastr.success('已删除文件夹');
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
  store.setCurrentFolder(folderName);
}

function toggleSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const next = new Set(store.selectedMemoIds);
  visibleIds.value.forEach(id => (checked ? next.add(id) : next.delete(id)));
  store.selectedMemoIds = next;
}

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(store.selectedMemoIds);
  if (checked) next.add(id);
  else next.delete(id);
  store.selectedMemoIds = next;
}

async function onBatchMove() {
  const target = batchMoveTarget.value;
  if (!target) return;
  const ids = [...store.selectedMemoIds];
  if (ids.length === 0) {
    toastr.warning('请先勾选要移动的条目');
    batchMoveTarget.value = '';
    return;
  }
  store.batchMoveMemo(target, ids);
  toastr.success(`已将 ${ids.length} 个条目移动到 "${target}"`);
  batchMoveTarget.value = '';
}

async function batchDelete() {
  const ids = [...store.selectedMemoIds];
  if (ids.length === 0) {
    toastr.warning('请先勾选要删除的条目');
    return;
  }
  if (!(await pmConfirm(`确定要删除选中的 ${ids.length} 个条目吗？\n此操作不可恢复！`))) return;
  store.deleteMemoEntries(ids);
  toastr.success(`已删除 ${ids.length} 个条目`);
}

function newEntry() {
  store.searchKeyword = '';
  const id = store.createMemoEntry();
  toastr.success(`已在 "${store.currentFolder}" 文件夹新建条目`);
  setTimeout(() => {
    const el = listRef.value?.querySelector(`[data-id="${id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

function updateName(id: string, name: string) {
  store.updateMemoEntry(id, { name: name.trim() || '未命名条目' });
}

function updateRole(id: string, role: string) {
  store.updateMemoEntry(id, {
    role: (role === 'user' || role === 'assistant' ? role : 'system') as MemoEntry['role'],
  });
}

function updateFolder(id: string, folder: string) {
  store.updateMemoEntry(id, { folder });
}

function updateContent(id: string, content: string) {
  store.updateMemoEntry(id, { content });
}

function toggleMemoExpand(id: string) {
  const willExpand = !store.expandedMemoIds.has(id);
  const pinned = pinMemoScrollState(listRef.value);
  store.toggleMemoExpanded(id);
  if (!willExpand) return;
  void nextTick(() => {
    restorePinnedScrollState(pinned, listRef.value);
    const item = listRef.value?.querySelector(`[data-id="${id}"]`);
    const field = item?.querySelector('textarea.memo-entry-content, input.memo-entry-name');
    if (field instanceof HTMLElement) {
      scheduleScrollMemoFieldIfNeeded(field, listRef.value);
    }
  });
}

let focusScrollPin: ReturnType<typeof pinMemoScrollState> | null = null;

function onListFocusInCapture(e: FocusEvent) {
  const t = e.target;
  if (!(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return;
  if (!t.classList.contains('memo-entry-content') && !t.classList.contains('memo-entry-name')) return;
  focusScrollPin = pinMemoScrollState(listRef.value);
}

function onListFocusIn(e: FocusEvent) {
  const t = e.target;
  if (!(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return;
  if (!t.classList.contains('memo-entry-content') && !t.classList.contains('memo-entry-name')) return;
  collapseChromeForKeyboard();
  const pinned = focusScrollPin ?? pinMemoScrollState(listRef.value);
  focusScrollPin = null;
  const scroller = listRef.value;
  requestAnimationFrame(() => {
    restorePinnedScrollState(pinned, scroller);
    scrollMemoFieldIfNeeded(t, scroller);
  });
}

let keyboardAlignTimer: ReturnType<typeof setTimeout> | null = null;

function collapseChromeForKeyboard() {
  if (getKeyboardInset() > 40) {
    if (foldersBarOpen.value) foldersBarOpen.value = false;
    if (toolbarOpen.value) toolbarOpen.value = false;
  }
}

function onKeyboardViewportChange() {
  collapseChromeForKeyboard();
  if (!isKeyboardLikelyOpen()) return;
  const active = listRef.value?.querySelector(':focus');
  if (
    !(active instanceof HTMLTextAreaElement) &&
    !(
      active instanceof HTMLInputElement &&
      (active.classList.contains('memo-entry-content') || active.classList.contains('memo-entry-name'))
    )
  ) {
    return;
  }
  if (keyboardAlignTimer) clearTimeout(keyboardAlignTimer);
  keyboardAlignTimer = setTimeout(() => {
    keyboardAlignTimer = null;
    scrollMemoFieldIfNeeded(active, listRef.value, { force: true });
  }, 120);
}

function copyEntry(id: string) {
  store.copyMemoEntry(id);
  toastr.success('已复制条目');
}

async function deleteEntry(entry: MemoEntry) {
  if (!(await pmConfirm(`确定要删除条目 "${entry.name}" 吗？`))) return;
  store.deleteMemoEntries([entry.id]);
  toastr.success('已删除条目');
}

function initSortable() {
  if (!listRef.value) return;
  const $list = $(listRef.value);
  if (typeof ($list as JQuery & { sortable?: unknown }).sortable !== 'function') return;
  if (($list as JQuery & { sortable: (a?: string) => unknown }).sortable('instance')) {
    ($list as JQuery & { sortable: (a: string) => void }).sortable('destroy');
  }
  ($list as JQuery & { sortable: (opts: object) => void }).sortable({
    handle: '.memo-drag-handle',
    items: '> .memo-entry-item',
    cancel: 'input,textarea,button,select,option,a,label,[contenteditable]',
    placeholder: 'memo-entry-placeholder',
    forcePlaceholderSize: true,
    tolerance: 'pointer',
    update: () => {
      const ids: string[] = [];
      $list.find('.memo-entry-item').each(function () {
        const id = $(this).attr('data-id');
        if (id) ids.push(id);
      });
      store.reorderMemoInFolder(ids);
    },
  });
}

function initFolderSortable() {
  if (!foldersBarRef.value) return;
  const $bar = $(foldersBarRef.value);
  if (typeof ($bar as JQuery & { sortable?: unknown }).sortable !== 'function') return;
  if (($bar as JQuery & { sortable: (a?: string) => unknown }).sortable('instance')) {
    ($bar as JQuery & { sortable: (a: string) => void }).sortable('destroy');
  }
  ($bar as JQuery & { sortable: (opts: object) => void }).sortable({
    items: '> .pm-folder-tab:not(.pm-folder-new):not([data-folder="默认"])',
    placeholder: 'pm-folder-placeholder',
    forcePlaceholderSize: true,
    tolerance: 'pointer',
    cancel: '.folder-pin, .folder-edit, .folder-delete, .pm-folder-new, [data-folder="默认"]',
    update: () => {
      const order: string[] = ['默认'];
      $bar.find('.pm-folder-tab').each(function () {
        const name = $(this).attr('data-folder');
        if (name && name !== '默认') order.push(name);
      });
      const nonDefault = order.filter(f => f !== '默认');
      store.reorderFolders(nonDefault);
    },
  });
}

onMounted(() => {
  const win = getTavernWindow();
  const vv = win.visualViewport;
  if (vv) {
    vv.addEventListener('resize', onKeyboardViewportChange);
    vv.addEventListener('scroll', onKeyboardViewportChange);
  }
  requestAnimationFrame(() => {
    initSortable();
    initFolderSortable();
  });
});

onUnmounted(() => {
  if (keyboardAlignTimer) clearTimeout(keyboardAlignTimer);
  const win = getTavernWindow();
  const vv = win.visualViewport;
  if (vv) {
    vv.removeEventListener('resize', onKeyboardViewportChange);
    vv.removeEventListener('scroll', onKeyboardViewportChange);
  }
});

watch(() => store.currentFolder, () => setTimeout(initSortable, 50));
watch(() => store.sortedFolders.join(','), () => {
  if (foldersBarOpen.value) setTimeout(initFolderSortable, 50);
});
watch(foldersBarOpen, open => {
  if (open) setTimeout(initFolderSortable, 50);
});
</script>
