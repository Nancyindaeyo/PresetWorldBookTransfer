<template>
  <div class="pm-popup-overlay pm-expanded-editor-overlay" @click.self="cancel">
    <div class="pm-expanded-editor">
      <div class="pm-expanded-editor-header">
        <div class="pm-expanded-editor-title">{{ title }}</div>
        <div class="pm-icon-toolbar pm-expanded-editor-toolbar">
          <label
            v-if="presetVarLint"
            class="pm-expanded-varlint-toggle"
            title="变量引用检查 (setvar/getvar)"
          >
            <input v-model="showVarLint" type="checkbox" class="pm-checkbox pm-expanded-varlint-checkbox" />
            <i class="fa-solid fa-right-left"></i>
          </label>
          <label class="pm-expanded-preview-toggle" title="宏预览渲染">
            <input v-model="showPreview" type="checkbox" class="pm-checkbox pm-expanded-preview-checkbox" />
            <i class="fa-solid fa-eye"></i>
          </label>
          <div
            class="menu_button interactable pm-expanded-macros-btn"
            tabindex="0"
            role="button"
            title="快捷插入管理"
            @click="emit('open-shortcuts')"
          >
            <i class="fa-solid fa-keyboard"></i>
          </div>
          <div class="menu_button interactable pm-expanded-cancel-btn" tabindex="0" role="button" title="取消" @click="cancel">
            <i class="fa-solid fa-xmark"></i>
          </div>
          <div class="menu_button interactable pm-expanded-apply-btn" tabindex="0" role="button" title="应用" @click="apply">
            <i class="fa-solid fa-check"></i>
          </div>
          <div class="menu_button interactable pm-expanded-close-btn" tabindex="0" role="button" title="应用并退出" @click="apply">
            <i class="fa-solid fa-compress"></i>
          </div>
        </div>
      </div>

      <div class="pm-expanded-editor-shortcuts">
        <button
          v-for="(sc, i) in shortcuts"
          :key="i"
          type="button"
          class="menu_button interactable pm-shortcut-btn"
          @click="insertShortcut(sc.insert)"
        >
          {{ sc.label }}
        </button>
      </div>

      <div v-if="showVarLint && presetVarLint" class="pm-expanded-varlint-pane">
        <div class="pm-varlint-head">
          <span class="pm-preview-label">变量引用</span>
          <span class="pm-varlint-sub">仅分析当前条目涉及的 setvar / getvar</span>
        </div>
        <VarLintPanel
          :entries="presetVarLint?.getEntries(localContent) ?? []"
          :current-index="presetVarLint?.currentIndex ?? -1"
          :content="localContent"
          @jump="jumpToEntry"
        />
      </div>

      <div v-show="showPreview" class="pm-expanded-preview-pane">
        <div class="pm-preview-label">渲染结果 (含自定义宏)</div>
        <pre class="pm-expanded-preview-rendered">{{ previewText }}</pre>
      </div>

      <textarea
        ref="textareaRef"
        v-model="localContent"
        class="text_pole pm-expanded-editor-textarea"
        data-macros-autocomplete="hide"
        autocomplete="off"
        @keydown.escape.stop="cancel"
      ></textarea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { renderMacros } from '../lib/render-macros';
import type { PresetVarLintEntry } from '../var-lint';
import type { Shortcut } from '../schema';
import VarLintPanel from './VarLintPanel.vue';

export type PresetVarLintContext = {
  getEntries: (liveContent: string) => PresetVarLintEntry[];
  currentIndex: number;
  onJumpToEntry: (index: number) => void;
};

const props = defineProps<{
  title: string;
  content: string;
  shortcuts: Shortcut[];
  presetVarLint?: PresetVarLintContext;
}>();

const emit = defineEmits<{
  apply: [content: string];
  cancel: [];
  'open-shortcuts': [];
}>();

const localContent = ref(props.content);
const showPreview = ref(false);
const showVarLint = ref(false);
const previewText = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

let previewTimer: ReturnType<typeof setTimeout> | null = null;
let previewSeq = 0;

watch(
  () => props.content,
  v => {
    localContent.value = v;
  },
);

watch(localContent, () => schedulePreview());

watch(showPreview, on => {
  if (on) void renderLivePreview();
});

async function renderLivePreview() {
  const content = localContent.value;
  const seq = ++previewSeq;
  previewText.value = '渲染中…';
  try {
    const rendered = await renderMacros(content);
    if (seq !== previewSeq || !showPreview.value) return;
    previewText.value = rendered;
  } catch (e) {
    if (seq !== previewSeq || !showPreview.value) return;
    console.error(e);
    previewText.value = '渲染失败: ' + String((e as Error)?.message ?? e);
  }
}

function schedulePreview() {
  if (!showPreview.value) return;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    void renderLivePreview();
  }, 280);
}

function insertShortcut(text: string) {
  const el = textareaRef.value;
  if (!el) return;
  const start = el.selectionStart ?? localContent.value.length;
  const end = el.selectionEnd ?? start;
  const before = localContent.value.slice(0, start);
  const after = localContent.value.slice(end);
  localContent.value = before + text + after;
  const pos = start + text.length;
  void nextTick(() => {
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

function apply() {
  emit('apply', localContent.value);
}

function cancel() {
  emit('cancel');
}

function jumpToEntry(index: number) {
  emit('apply', localContent.value);
  props.presetVarLint?.onJumpToEntry(index);
}

onMounted(() => {
  void nextTick(() => textareaRef.value?.focus());
});
</script>
