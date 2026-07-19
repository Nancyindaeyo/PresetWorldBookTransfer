<template>
  <div class="pm-popup-overlay pm-cot-preview-overlay" @click.self="emit('close')">
    <div class="pm-popup pm-popup-large pm-cot-preview-popup">
      <div class="pm-cot-preview-header">
        <div class="pm-popup-message pm-cot-preview-head">
          <strong><i class="fa-solid fa-brain"></i> CoT 拼装预览</strong>
          <span v-if="result && !loading" class="pm-cot-preview-badge" :class="`is-${result.mode}`">
            {{ result.mode === 'cot' ? 'CoT 条目' : '预设切片' }}
          </span>
          <span v-if="result && !loading" class="pm-cot-preview-badge is-source">
            {{ result.source === 'dry-run' ? 'dry-run' : '静态' }}
          </span>
        </div>
        <div
          class="menu_button interactable pm-icon-btn pm-cot-preview-close"
          title="关闭"
          @click="emit('close')"
        >
          <i class="fa-solid fa-xmark"></i>
        </div>
      </div>

      <div v-if="loading" class="pm-cot-preview-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>正在 dry-run 拼装预设（不调用 API）…</span>
      </div>

      <template v-else-if="result">
        <p class="pm-hint pm-cot-preview-note">{{ result.note }}</p>
        <p class="pm-hint pm-cot-preview-meta">
          共 {{ result.items.length }} 条 · 下方为按位置顺序的大致拼接结果
        </p>
        <div class="pm-cot-preview-body">
          <div
            v-for="(item, i) in result.items"
            :key="`${item.identifier}-${i}`"
            class="pm-cot-preview-item"
          >
            <div class="pm-cot-preview-item-head">
              <span class="pm-cot-preview-item-index">{{ i + 1 }}.</span>
              <span class="pm-cot-preview-item-title">{{ item.name }}</span>
              <span class="pm-cot-preview-role-pill" :class="`is-${item.role}`">{{ item.role }}</span>
            </div>
            <pre
              class="pm-cot-preview-item-text"
              :class="{
                'is-hint': !item.content.trim(),
                'is-placeholder': item.isPlaceholder && !item.content.trim(),
              }"
            >{{ getCotPreviewItemBody(item) }}</pre>
          </div>
        </div>
      </template>

      <div class="pm-popup-actions pm-cot-preview-actions">
        <div class="menu_button interactable pm-popup-cancel pm-cot-preview-close-btn" @click="emit('close')">
          关闭
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getCotPreviewItemBody, type CotPreviewResult } from '../lib/cot-preset-preview';

defineProps<{
  loading: boolean;
  result: CotPreviewResult | null;
}>();

const emit = defineEmits<{ close: [] }>();
</script>
