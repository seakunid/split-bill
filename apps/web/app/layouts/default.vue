<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="shell">
    <a class="skip" href="#content">{{ t('skip') }}</a>
    <AppHeader />
    <main id="content" class="main">
      <slot />
    </main>
  </div>
</template>
