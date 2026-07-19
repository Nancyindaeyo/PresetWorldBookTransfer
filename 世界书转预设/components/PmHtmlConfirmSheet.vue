<template>
  <div class="pm-popup-overlay pm-popup-overlay--save-summary" @click.self="emit('cancel')">
    <div class="pm-popup pm-popup-save-summary">
      <div class="pm-save-summary-body" v-html="bodyHtml"></div>
      <div class="pm-popup-actions">
        <div class="menu_button interactable pm-popup-cancel" @click="emit('cancel')">{{ cancelLabel }}</div>
        <div class="menu_button interactable pm-popup-confirm" @click="emit('confirm')">{{ confirmLabel }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    bodyHtml: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }>(),
  {
    confirmLabel: '确定',
    cancelLabel: '取消',
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>
