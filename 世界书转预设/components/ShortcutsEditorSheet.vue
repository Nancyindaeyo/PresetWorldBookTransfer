<template>
  <div class="pm-popup-overlay" @click.self="onCancel">
    <div class="pm-popup pm-popup-large pm-shortcuts-editor-popup">
      <div class="pm-shortcuts-editor-head">
        <div class="pm-shortcuts-editor-head-main">
          <div class="pm-shortcuts-editor-title">
            <i class="fa-solid fa-keyboard"></i>
            <span>快捷插入管理</span>
          </div>
          <p class="pm-shortcuts-editor-desc">
            编辑下方按钮：编辑备忘录时点击按钮会把「插入文本」放到光标位置。「按钮标题」是展示在按钮上的文字。
          </p>
        </div>
        <div class="pm-icon-toolbar pm-shortcuts-toolbar" @click.stop>
          <div class="menu_button interactable" title="新建" @click.stop="addRow">
            <i class="fa-solid fa-plus"></i>
          </div>
          <div class="menu_button interactable" title="恢复默认" @click.stop="restoreDefault">
            <i class="fa-solid fa-rotate-left"></i>
          </div>
          <div class="menu_button interactable" title="取消" @click.stop="onCancel">
            <i class="fa-solid fa-xmark"></i>
          </div>
          <div class="menu_button interactable pm-shortcuts-save" title="保存" @click.stop="save">
            <i class="fa-solid fa-check"></i>
          </div>
        </div>
      </div>

      <div class="pm-shortcuts-list">
        <div v-for="(item, i) in local" :key="i" class="pm-shortcut-row">
          <input
            v-model="item.label"
            type="text"
            class="text_pole pm-shortcut-label"
            placeholder="按钮标题"
          />
          <i class="fa-solid fa-arrow-right pm-macro-arrow" aria-hidden="true"></i>
          <input
            v-model="item.insert"
            type="text"
            class="text_pole pm-shortcut-insert"
            placeholder="插入内容"
            data-macros-autocomplete="hide"
            autocomplete="off"
          />
          <div class="menu_button interactable pm-shortcut-del" title="删除" @click.stop="removeRow(i)">
            <i class="fa-solid fa-trash"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { saveShortcuts } from '../lib/script-vars';
import { DEFAULT_SHORTCUTS, type Shortcut } from '../schema';
import { usePresetMemoStore } from '../store';

const store = usePresetMemoStore();
const emit = defineEmits<{ close: []; saved: [] }>();

function cloneShortcutList(src: Shortcut[]): Shortcut[] {
  const base = src.length > 0 ? src : DEFAULT_SHORTCUTS;
  return base.map(s => ({ ...s }));
}

const local = ref<Shortcut[]>(cloneShortcutList(store.shortcuts));

function addRow() {
  local.value = [...local.value, { label: '', insert: '' }];
}

function removeRow(index: number) {
  local.value = local.value.filter((_, i) => i !== index);
}

function restoreDefault() {
  local.value = DEFAULT_SHORTCUTS.map(s => ({ ...s }));
}

function onCancel() {
  emit('close');
}

function save() {
  const cleaned = local.value.filter(s => s.label.trim() && s.insert);
  store.shortcuts = cleaned;
  saveShortcuts(cleaned);
  toastr.success('快捷插入已保存');
  emit('saved');
  emit('close');
}
</script>
