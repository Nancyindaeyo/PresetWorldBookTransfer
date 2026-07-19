<template>
  <div class="pm-search-box" :class="compact ? 'pm-compact' : ''">
    <i class="fa-solid fa-magnifying-glass"></i>
    <PmStableField
      :model-value="modelValue"
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <i
      v-if="modelValue"
      class="fa-solid fa-xmark pm-search-clear"
      title="清空"
      @click="clear"
    ></i>
  </div>
</template>

<script setup lang="ts">
import PmStableField from './PmStableField.vue';

defineProps<{
  modelValue: string;
  placeholder?: string;
  compact?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [v: string] }>();

function clear() {
  emit('update:modelValue', '');
}
</script>
