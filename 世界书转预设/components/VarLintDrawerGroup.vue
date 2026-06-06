<template>
  <div v-if="rows.length" class="pm-varlint-group">
    <div class="pm-varlint-group-title" :class="{ 'pm-varlint-group-title--warn': dup }">
      {{ title }}
      <span class="pm-varlint-group-count">{{ rows.length }}</span>
    </div>
    <div class="pm-varlint-drawers">
      <div
        v-for="row in rows"
        :key="rowKey(row)"
        class="pm-varlint-drawer"
        :class="{ 'pm-varlint-drawer--dup': dup, 'is-open': openDrawers.has(rowKey(row)) }"
      >
        <div class="pm-varlint-drawer-head interactable" role="button" tabindex="0" @click="emit('toggle', rowKey(row))" @keydown.enter.prevent="emit('toggle', rowKey(row))">
          <i class="fa-solid fa-chevron-right pm-varlint-drawer-chevron"></i>
          <span class="pm-varlint-drawer-name" v-html="rowTitle(row)"></span>
          <span v-if="row.overrideHint" class="pm-varlint-override-hint" :title="row.overrideHintTitle">{{ row.overrideHint }}</span>
          <span class="pm-varlint-drawer-meta">×{{ row.count }}</span>
          <button type="button" class="pm-varlint-jump" title="跳转并应用当前编辑" @click.stop="emit('jump', row.index)">
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
        <div v-show="openDrawers.has(rowKey(row))" class="pm-varlint-drawer-body">
          <pre class="pm-varlint-drawer-preview" v-html="previewHtml(row)"></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { renderVarMacroPreviewHtml, varLintEntryBadges } from '../lib/var-lint-ui';
import { esc } from '../lib/search';

type Row = {
  index: number;
  entryName: string;
  enabled: boolean;
  pendingDelete?: boolean;
  macroKind: 'set' | 'get';
  count: number;
  overrideHint?: string;
  overrideHintTitle?: string;
};

const props = defineProps<{
  title: string;
  rows: Row[];
  varName: string;
  rowKind: string;
  dup?: boolean;
  openDrawers: Set<string>;
  entryContents: Map<number, string>;
}>();

const emit = defineEmits<{ toggle: [key: string]; jump: [index: number] }>();

function rowKey(row: Row) {
  return `${props.rowKind}:${row.index}:${props.varName}`;
}

function rowTitle(row: Row) {
  return `${esc(row.entryName)}${varLintEntryBadges(row)}`;
}

function previewHtml(row: Row) {
  const content = props.entryContents.get(row.index) ?? '';
  return renderVarMacroPreviewHtml(content, props.varName, row.macroKind);
}
</script>
