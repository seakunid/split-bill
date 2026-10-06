<script setup lang="ts">
defineProps<{ step: 1 | 2 | 3 }>()
const { t } = useI18n()
</script>

<template>
  <ol class="steps" :aria-label="t('steps.split')">
    <li :class="{ on: step >= 1 }">{{ t('steps.photo') }}</li>
    <li :class="{ on: step >= 2 }">{{ t('steps.review') }}</li>
    <li :class="{ on: step >= 3 }">{{ t('steps.split') }}</li>
  </ol>
</template>
