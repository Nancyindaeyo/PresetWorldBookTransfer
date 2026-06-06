<template>
  <div class="pm-varlint-list">
    <div v-if="report.items.length === 0" class="pm-varlint-empty">当前条目未使用 setvar / getvar</div>
    <div
      v-for="item in report.items"
      :key="item.varName + '-' + item.macroKind"
      class="pm-varlint-item"
      :class="item.status === 'ok' ? 'pm-varlint-item--ok' : 'pm-varlint-item--missing'"
    >
      <div class="pm-varlint-item-head">
        <span class="pm-varlint-kind" :class="'pm-varlint-kind--' + item.macroKind">{{ item.macroKind }}</span>
        <span class="pm-varlint-name">{{ item.varName }}</span>
        <span class="pm-varlint-local">本条目 ×{{ item.localCount }}</span>
      </div>
      <div class="pm-varlint-status">{{ statusText(item) }}</div>
      <div class="pm-varlint-groups">
        <template v-if="item.macroKind === 'set'">
          <VarLintDrawerGroup
            title="后续读取条目"
            :rows="item.refs"
            :var-name="item.varName"
            row-kind="ref"
            :open-drawers="openDrawers"
            :entry-contents="entryContents"
            @toggle="toggleDrawer"
            @jump="emit('jump', $event)"
          />
          <VarLintDrawerGroup
            title="同名 setvar · 其他定义"
            :rows="dupSetRows(item)"
            :var-name="item.varName"
            row-kind="dup-set"
            dup
            :open-drawers="openDrawers"
            :entry-contents="entryContents"
            @toggle="toggleDrawer"
            @jump="emit('jump', $event)"
          />
        </template>
        <template v-else>
          <VarLintDrawerGroup
            title="前序定义条目"
            :rows="item.refs"
            :var-name="item.varName"
            row-kind="ref"
            :open-drawers="openDrawers"
            :entry-contents="entryContents"
            @toggle="toggleDrawer"
            @jump="emit('jump', $event)"
          />
          <VarLintDrawerGroup
            title="同名 getvar · 其他引用"
            :rows="item.duplicateGets.map(d => ({ ...d, macroKind: 'get' as const }))"
            :var-name="item.varName"
            row-kind="dup-get"
            dup
            :open-drawers="openDrawers"
            :entry-contents="entryContents"
            @toggle="toggleDrawer"
            @jump="emit('jump', $event)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { analyzePresetVarLint, type PresetVarLintEntry, type VarLintItem } from '../var-lint';
import { dupSetOverrideHint } from '../lib/var-lint-ui';
import VarLintDrawerGroup from './VarLintDrawerGroup.vue';

const props = defineProps<{
  entries: PresetVarLintEntry[];
  currentIndex: number;
  content: string;
}>();

const emit = defineEmits<{ jump: [index: number] }>();

const openDrawers = ref(new Set<string>());

const report = computed(() => analyzePresetVarLint(props.entries, props.currentIndex, props.content));

const entryContents = computed(() => {
  const map = new Map<number, string>();
  props.entries.forEach(e => map.set(e.index, e.content));
  return map;
});

watch(
  () => props.content,
  () => {
    openDrawers.value = new Set();
  },
);

function drawerKey(index: number, varName: string, kind: string) {
  return `${kind}:${index}:${varName}`;
}

function toggleDrawer(key: string) {
  const next = new Set(openDrawers.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  openDrawers.value = next;
}

function statusText(item: VarLintItem) {
  if (item.macroKind === 'set') {
    return item.status === 'ok'
      ? `后续 ${item.refs.length} 个条目读取 (getvar)`
      : '后续无 getvar，变量可能不会被读取';
  }
  return item.status === 'ok'
    ? `前序 ${item.refs.length} 个条目定义 (setvar)`
    : '前序无 setvar，运行时可能读不到值';
}

function dupSetRows(item: VarLintItem) {
  return item.duplicateSets.map(d => {
    const hint = dupSetOverrideHint(d.entryName, d.relativeOrder);
    return {
      ...d,
      macroKind: 'set' as const,
      overrideHint: hint.label,
      overrideHintTitle: hint.title,
    };
  });
}

</script>
