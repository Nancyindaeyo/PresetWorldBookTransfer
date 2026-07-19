<template>
  <div class="pm-searchable-select" :class="{ 'is-open': dropdownOpen }">
    <input
      ref="inputRef"
      :value="displayValue"
      type="text"
      class="text_pole pm-select-input"
      :placeholder="placeholder"
      autocomplete="off"
      data-macros-autocomplete="hide"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
    />
    <div v-show="dropdownOpen" class="pm-select-dropdown">
      <div v-if="filteredOptions.length === 0" class="pm-select-empty">无匹配项</div>
      <div
        v-for="opt in filteredOptions"
        :key="opt"
        class="pm-select-option"
        @mousedown.prevent="selectOption(opt)"
      >
        {{ opt }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  modelValue: string;
  options: string[];
  placeholder?: string;
  allowCustom?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [v: string]; change: [v: string] }>();

const dropdownOpen = ref(false);
const filterText = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const displayValue = computed(() => (dropdownOpen.value ? filterText.value : props.modelValue));

const filteredOptions = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter(o => o.toLowerCase().includes(q));
});

function commit(val: string) {
  emit('update:modelValue', val);
  emit('change', val);
  filterText.value = val;
  dropdownOpen.value = false;
}

function onFocus() {
  filterText.value = props.modelValue;
  dropdownOpen.value = true;
}

function onInput(e: Event) {
  filterText.value = (e.target as HTMLInputElement).value;
  dropdownOpen.value = true;
}

function onBlur() {
  setTimeout(() => {
    dropdownOpen.value = false;
    const raw = filterText.value.trim();
    if (!raw) {
      commit('');
      return;
    }
    if (props.options.includes(raw)) {
      commit(raw);
      return;
    }
    const matched = props.options.filter(o => o.toLowerCase().includes(raw.toLowerCase()));
    if (matched.length === 1) commit(matched[0]!);
    else if (props.allowCustom) commit(raw);
    else filterText.value = props.modelValue;
  }, 120);
}

function selectOption(opt: string) {
  commit(opt);
}
</script>
