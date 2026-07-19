<template>
  <div id="tab-insert" class="pm-tab-content">
    <div class="pm-info-box pm-info-compact">
      <i class="fa-solid fa-circle-info"></i>
      在下方选择插入点后会先进入预览草稿，可逐条修改。点击垃圾桶会标记删除（条目变灰），再次点击可恢复；只有点击顶部「保存预设」后才会真正写入并移除已标记条目。
    </div>

    <div class="pm-insert-cot-preview-row">
      <div
        class="menu_button interactable pm-insert-cot-preview-btn"
        :class="{ 'is-disabled': store.insertDraftDirty }"
        title="预览已保存预设中 CoT 条目的大致拼装（不调用 API；需先保存预设）"
        @click="openCotPreview"
      >
        <i class="fa-solid fa-brain" aria-hidden="true"></i>
        <span class="pm-insert-cot-preview-label">CoT 预览</span>
      </div>
      <span v-if="store.insertDraftDirty" class="pm-hint pm-insert-cot-preview-hint">请先保存预设后再预览</span>
    </div>

    <div class="pm-entry-nav-search">
      <PmSearchBox v-model="store.insertNavSearchKeyword" placeholder="搜索条目名/内容，点击结果跳转..." compact />
      <div v-if="navResults.length" class="pm-nav-search-dropdown">
        <div v-for="item in navResults" :key="item.index" class="pm-nav-search-item" @click="jumpTo(item.index)">
          {{ item.name }}
        </div>
      </div>
    </div>

    <div class="pm-list pm-insert-list" style="flex: 1; min-height: 0">
      <div class="pm-hint" style="margin-bottom: 6px">
        {{
          checkedMemoCount > 0
            ? `当前已从备忘录勾选 ${checkedMemoCount} 个条目，点击任意插入点可加入草稿。`
            : '当前未勾选备忘录条目，点击插入点时将弹出选择器（支持按文件夹整组插入）。'
        }}
      </div>

      <template v-for="(prompt, i) in drafts" :key="'block-' + i">
        <div class="insert-point" @click="insertAt(i)">
          <div class="insert-btn interactable"><i class="fa-solid fa-plus"></i> 插入到此处</div>
        </div>
        <div
          class="preset-prompt-item"
          :class="{
            'is-draft': prompt.__draftFromMemo,
            'is-pending-delete': prompt.__pendingDelete,
            'is-prompt-disabled': !prompt.__pendingDelete && !prompt.enabled,
            'is-search-highlight': highlightIndex === i,
          }"
          :data-prompt-index="i"
        >
          <div class="preset-prompt-header" @click="toggleEdit(i)">
            <div class="preset-prompt-title">
              {{ prompt.name }}
              <span class="role-tag">({{ prompt.role }})</span>
              <span v-if="prompt.__draftFromMemo" class="draft-badge">来自备忘录</span>
              <span v-if="!prompt.__pendingDelete && !prompt.enabled" class="prompt-disabled-badge">已禁用</span>
            </div>
            <div class="preset-prompt-actions" style="display: flex; gap: 10px">
              <div
                class="preset-prompt-enable-btn"
                :title="prompt.enabled ? '禁用条目' : '启用条目'"
                @click.stop="toggleEnable(i)"
              >
                <i class="fa-solid" :class="prompt.enabled ? 'fa-ban' : 'fa-circle-check'"></i>
              </div>
              <div class="preset-prompt-edit-btn" title="查看/编辑" @click.stop="toggleEdit(i)">
                <i class="fa-solid fa-pen"></i>
              </div>
              <div
                class="preset-prompt-delete-btn"
                :title="prompt.__pendingDelete ? '取消删除标记' : '标记删除'"
                style="color: var(--pm-danger)"
                @click.stop="toggleDelete(i)"
              >
                <i class="fa-solid" :class="prompt.__pendingDelete ? 'fa-rotate-left' : 'fa-trash'"></i>
              </div>
            </div>
          </div>
          <div v-show="editingIndex === i" class="preset-prompt-edit">
            <PmStableField
              :model-value="prompt.name"
              field-class="edit-name"
              @update:model-value="
                v => {
                  prompt.name = v;
                  store.insertDraftDirty = true;
                }
              "
            />
            <select v-model="prompt.role" class="text_pole edit-role" @change="store.insertDraftDirty = true">
              <option value="system">System</option>
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
            </select>
            <div class="pm-edit-content-toolbar">
              <span class="pm-edit-content-label">内容</span>
              <div
                class="menu_button pm-content-expand-btn interactable"
                title="全屏编辑"
                @click="emit('expand-draft', i)"
              >
                <i class="fa-solid fa-expand"></i>
              </div>
            </div>
            <PmStableField
              :model-value="prompt.content"
              multiline
              field-class="edit-content"
              @update:model-value="
                v => {
                  prompt.content = v;
                  store.insertDraftDirty = true;
                }
              "
            />
            <div class="save-btn save-preset-btn" @click="applyEdit(i)"><i class="fa-solid fa-check"></i> 应用修改</div>
          </div>
        </div>
      </template>
      <div class="insert-point" @click="insertAt(drafts.length)">
        <div class="insert-btn interactable"><i class="fa-solid fa-plus"></i> 插入到此处</div>
      </div>
    </div>

    <InsertPickSheet v-if="showPickSheet" @close="showPickSheet = false" @confirm="onPicked" />
    <CotPresetPreviewSheet
      v-if="showCotPreview"
      :loading="cotPreviewLoading"
      :result="cotPreviewResult"
      @close="showCotPreview = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref } from 'vue';
import { getTavernDocument } from '@util/tavern-context';
import { buildCotPresetPreview, type CotPreviewResult } from '../lib/cot-preset-preview';
import { entryMatchesKeyword } from '../lib/search';
import type { PresetPromptDraft } from '../lib/preset-draft';
import { usePresetMemoStore } from '../store';
import CotPresetPreviewSheet from './CotPresetPreviewSheet.vue';
import PmSearchBox from './PmSearchBox.vue';
import PmStableField from './PmStableField.vue';
import InsertPickSheet from './InsertPickSheet.vue';

const store = usePresetMemoStore();
const editingIndex = ref<number | null>(null);
const highlightIndex = ref<number | null>(null);
const showPickSheet = ref(false);
const showCotPreview = ref(false);
const cotPreviewLoading = ref(false);
const cotPreviewResult = ref<CotPreviewResult | null>(null);
const pendingInsertIndex = ref(0);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

const emit = defineEmits<{ 'expand-draft': [index: number] }>();

const drafts = computed(() => store.insertDraftPrompts ?? []);

const checkedMemoCount = computed(() => store.selectedMemoIds.size);

const navResults = computed(() => {
  const k = store.insertNavSearchKeyword.trim();
  if (!k) return [];
  return (store.insertDraftPrompts ?? [])
    .map((p, index) => ({ index, name: p.name, content: p.content }))
    .filter(p => entryMatchesKeyword(k, p.name, p.content))
    .slice(0, 12);
});

function jumpToInsertPrompt(index: number) {
  const el = getTavernDocument().querySelector(`#tab-insert .preset-prompt-item[data-prompt-index="${index}"]`);
  if (!el) {
    toastr.warning('未找到对应条目，列表可能已变更');
    return;
  }

  store.insertNavSearchKeyword = '';
  editingIndex.value = index;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  highlightIndex.value = index;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightIndex.value = null;
    highlightTimer = null;
  }, 3000);
}

function jumpTo(index: number) {
  jumpToInsertPrompt(index);
}

async function onJumpInsertEvent(e: Event) {
  const idx = (e as CustomEvent<number>).detail;
  if (typeof idx !== 'number') return;
  store.switchTab('tab-insert');
  await nextTick();
  jumpToInsertPrompt(idx);
}

function toggleEdit(i: number) {
  editingIndex.value = editingIndex.value === i ? null : i;
}

function toggleEnable(i: number) {
  const p = store.insertDraftPrompts?.[i];
  if (!p || p.__pendingDelete) {
    toastr.warning('请先取消删除标记再启用/禁用');
    return;
  }
  p.enabled = !p.enabled;
  store.insertDraftDirty = true;
  toastr.info(p.enabled ? '已启用条目' : '已禁用条目，保存预设后生效');
}

function toggleDelete(i: number) {
  const p = store.insertDraftPrompts?.[i];
  if (!p) return;
  p.__pendingDelete = !p.__pendingDelete;
  store.insertDraftDirty = true;
  toastr.info(p.__pendingDelete ? '已标记删除，保存预设后生效' : '已取消删除标记');
}

function applyEdit(i: number) {
  const p = store.insertDraftPrompts?.[i];
  if (!p) return;
  p.name = p.name.trim() || '未命名条目';
  store.insertDraftDirty = true;
  editingIndex.value = null;
  toastr.success('已更新草稿条目');
}

async function insertAt(index: number) {
  store.ensureInsertDraftLoaded();
  pendingInsertIndex.value = index;

  const selected = store.memo.filter(e => store.selectedMemoIds.has(e.id));
  if (selected.length > 0) {
    store.insertDraftsAt(
      index,
      selected.map(e => store.toPresetDraftFromMemo(e)),
    );
    toastr.success(`已插入 ${selected.length} 个条目到预览草稿`);
    return;
  }

  showPickSheet.value = true;
}

function onPicked(draftsToInsert: PresetPromptDraft[]) {
  showPickSheet.value = false;
  if (draftsToInsert.length === 0) return;
  store.insertDraftsAt(pendingInsertIndex.value, draftsToInsert);
  toastr.success(`已插入 ${draftsToInsert.length} 个条目到预览草稿`);
}

async function openCotPreview() {
  if (store.insertDraftDirty) {
    toastr.warning('请先保存预设后再预览');
    return;
  }
  showCotPreview.value = true;
  cotPreviewLoading.value = true;
  cotPreviewResult.value = null;
  try {
    cotPreviewResult.value = await buildCotPresetPreview();
  } catch (e) {
    console.error('[CoT预览] 失败', e);
    toastr.error('CoT 预览失败，请查看控制台');
    showCotPreview.value = false;
  } finally {
    cotPreviewLoading.value = false;
  }
}

onMounted(() => {
  window.addEventListener('preset-memo-jump-insert', onJumpInsertEvent);
});

onActivated(() => {
  try {
    store.syncInsertDraftFromInUseIfClean();
  } catch {
    /* 忽略 */
  }
});

onUnmounted(() => {
  window.removeEventListener('preset-memo-jump-insert', onJumpInsertEvent);
  if (highlightTimer) clearTimeout(highlightTimer);
});
</script>
