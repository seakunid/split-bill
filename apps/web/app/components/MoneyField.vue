<script setup lang="ts">
import { formatRupiahDigits, parseRupiah } from '../../lib/money'

const props = defineProps<{
  modelValue: number
  label: string
  id: string
  /** Allow a leading minus. Used for pembulatan / rounding. */
  signed?: boolean
  hint?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const focused = ref(false)
const text = ref(formatAmount(props.modelValue))

watch(
  () => props.modelValue,
  (value) => {
    if (!focused.value) text.value = formatAmount(value)
  },
)

function formatAmount(value: number): string {
  const digits = formatRupiahDigits(value)
  return props.signed && value < 0 ? `-${digits}` : digits
}

function onFocus() {
  focused.value = true
  text.value = props.modelValue === 0 ? '' : String(props.modelValue)
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  text.value = raw
  if (props.signed && raw.trim() === '-') {
    emit('update:modelValue', 0)
    return
  }
  const value = parseRupiah(raw)
  emit('update:modelValue', props.signed ? value : Math.max(0, value))
}

function onBlur() {
  focused.value = false
  text.value = formatAmount(props.modelValue)
}
</script>

<template>
  <span class="money-field">
    <label :for="id">{{ label }}</label>
    <span class="money-control">
      <span class="rp" aria-hidden="true">Rp</span>
      <input
        :id="id"
        :value="text"
        inputmode="numeric"
        autocomplete="off"
        :aria-describedby="hint ? `${id}-hint` : undefined"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
      />
    </span>
    <p v-if="hint" :id="`${id}-hint`" class="hint">{{ hint }}</p>
  </span>
</template>

<style scoped>
.money-field {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.money-control {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 6px;
  border: 1px solid var(--line);
  background: white;
  border-radius: 12px;
  min-height: 44px;
  padding: 0 12px;
}

.money-control:focus-within {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, white);
  border-color: var(--accent);
}

.money-control input {
  border: 0;
  min-height: 42px;
  padding: 8px 0;
  outline: none;
  width: 100%;
  background: transparent;
  font-variant-numeric: tabular-nums;
}

.rp {
  color: var(--muted);
  font-weight: 650;
}

.hint {
  margin: 6px 0 0;
}
</style>
