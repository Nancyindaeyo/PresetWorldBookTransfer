<template>
  <component
    :is="multiline ? 'textarea' : 'input'"
    ref="fieldRef"
    :type="multiline ? undefined : 'text'"
    class="text_pole"
    :class="fieldClass"
    :value="local"
    :placeholder="placeholder"
    data-macros-autocomplete="hide"
    autocomplete="off"
    @input="onInput"
    @change="onChange"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { getTavernDocument } from '@util/tavern-context';

const props = defineProps<{
  modelValue: string;
  multiline?: boolean;
  fieldClass?: string;
  placeholder?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [v: string]; change: [v: string] }>();

const local = ref(props.modelValue);
const fieldRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

watch(
  () => props.modelValue,
  v => {
    if (fieldRef.value) {
      const active = document.activeElement || getTavernDocument().activeElement;
      if (active === fieldRef.value || getTavernDocument().activeElement === fieldRef.value) return;
    }
    local.value = v;
  },
);

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  local.value = v;
  emit('update:modelValue', v);
}

function onChange(e: Event) {
  emit('change', (e.target as HTMLInputElement | HTMLTextAreaElement).value);
}
</script>
