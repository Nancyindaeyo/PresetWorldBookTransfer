<template>
  <div
    class="wb-entry-item"
    :class="{ 'is-search-highlight': highlighted }"
    :data-source-key="draft.sourceKey"
    :data-index="draft.presetIndex != null ? String(draft.presetIndex) : undefined"
  >
    <div class="wb-entry-header">
      <input
        type="checkbox"
        class="export-entry-checkbox pm-checkbox"
        style="margin-top: 4px"
        :checked="checked"
        @change="emit('toggle')"
      />
      <div class="wb-content" @click="emit('toggle')">
        <div class="wb-title" v-html="titleHtml"></div>
        <div class="wb-desc">{{ preview }}</div>
      </div>
      <div class="wb-actions">
        <div
          class="menu_button pm-content-expand-btn pm-icon-btn interactable"
          title="全屏编辑"
          @click.stop="emit('expand')"
        >
          <i class="fa-solid fa-expand"></i>
        </div>
        <div class="wb-actions-edit" title="展开编辑" @click.stop="expanded = !expanded">
          <i class="fa-solid fa-pen"></i>
        </div>
      </div>
    </div>
    <div v-show="expanded" class="wb-entry-edit pm-export-entry-edit">
      <input v-model="local.name" type="text" class="text_pole edit-name" placeholder="名称" data-macros-autocomplete="hide" />
      <div class="pm-export-form-row pm-export-strategy-row">
        <span class="pm-export-label">激活</span>
        <div class="pm-strategy-segments">
          <button
            type="button"
            class="pm-strategy-seg"
            :class="{ active: local.strategyType === 'constant' }"
            @click="local.strategyType = 'constant'"
          >
            🔵 蓝灯
          </button>
          <button
            type="button"
            class="pm-strategy-seg"
            :class="{ active: local.strategyType === 'selective' }"
            @click="local.strategyType = 'selective'"
          >
            🟢 绿灯
          </button>
        </div>
      </div>
      <div v-show="local.strategyType === 'selective'" class="pm-export-form-row pm-export-keys-row">
        <span class="pm-export-label">关键词</span>
        <input v-model="local.keysText" type="text" class="pm-field-input edit-keys" placeholder="逗号分隔" />
      </div>
      <div class="pm-export-form-row pm-export-position-inline-row">
        <span class="pm-export-label">位置</span>
        <select v-model="local.positionType" class="pm-field-input edit-position-type">
          <option v-for="o in positionOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <span class="pm-export-label">顺序</span>
        <input v-model.number="local.positionOrder" type="number" class="pm-field-input edit-position-order" min="0" step="1" />
        <span v-if="local.positionType === 'at_depth'" class="pm-export-at-depth-inline">
          <span class="pm-export-label">深度</span>
          <input v-model.number="local.positionDepth" type="number" class="pm-field-input edit-position-depth" min="0" step="1" />
          <select v-model="local.positionRole" class="pm-field-input edit-position-role">
            <option value="system">System</option>
            <option value="user">User</option>
            <option value="assistant">Assistant</option>
          </select>
        </span>
      </div>
      <div class="pm-edit-content-toolbar">
        <span class="pm-edit-content-label">正文</span>
      </div>
      <textarea v-model="local.content" class="text_pole edit-content" data-macros-autocomplete="hide"></textarea>
      <div class="pm-export-form-row pm-export-recursion-row">
        <label class="pm-export-check">
          <input v-model="local.preventIncoming" type="checkbox" class="pm-checkbox edit-prevent-incoming" /> 不可递归
        </label>
        <label class="pm-export-check">
          <input v-model="local.preventOutgoing" type="checkbox" class="pm-checkbox edit-prevent-outgoing" /> 防止进一步递归
        </label>
      </div>
      <div class="save-btn save-export-local-btn" @click="applyLocal">
        <i class="fa-solid fa-check"></i> 应用修改
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  EXPORT_POSITION_OPTIONS,
  getExportPositionLabel,
  getExportStrategyBadge,
  type ExportWbDraft,
} from '../export-wb';
import { esc } from '../lib/search';

const props = defineProps<{ draft: ExportWbDraft; checked: boolean; highlighted?: boolean }>();
const emit = defineEmits<{ toggle: []; update: [Partial<ExportWbDraft>]; expand: [] }>();

const expanded = ref(false);
const local = ref({ ...props.draft });
const positionOptions = EXPORT_POSITION_OPTIONS.filter(o => o.value !== 'outlet');

watch(
  () => props.draft,
  d => {
    local.value = { ...d };
  },
  { deep: true },
);

watch(
  () => props.highlighted,
  v => {
    if (v) expanded.value = true;
  },
);

const preview = computed(() => {
  const t = (props.draft.content || '').replace(/\s+/g, ' ').trim();
  return t.length > 100 ? t.slice(0, 100) + '…' : t || '(空内容)';
});

const titleHtml = computed(() => {
  const badge = getExportStrategyBadge(props.draft);
  const posLabel = getExportPositionLabel(props.draft.positionType);
  const roleTag =
    props.draft.sourceType === 'preset' && props.draft.presetRole
      ? ` <span class="role-tag">(${esc(props.draft.presetRole)})</span>`
      : '';
  const meta = `${badge} ${esc(posLabel)} · order ${props.draft.positionOrder}`;
  return `${esc(props.draft.name)}${roleTag} <span class="pm-export-meta">${meta}</span>`;
});

function applyLocal() {
  emit('update', { ...local.value });
  expanded.value = false;
  toastr.success('已更新条目预览');
}
</script>
