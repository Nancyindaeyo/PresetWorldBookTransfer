<template>
  <PmHtmlConfirmSheet
    :body-html="bodyHtml"
    confirm-label="确认保存"
    cancel-label="取消"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { renderInsertSaveSummaryHtml, type InsertSaveSummary } from '../lib/insert-save-summary';
import PmHtmlConfirmSheet from './PmHtmlConfirmSheet.vue';

const props = defineProps<{ summary: InsertSaveSummary }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const bodyHtml = computed(() => renderInsertSaveSummaryHtml(props.summary));
</script>
