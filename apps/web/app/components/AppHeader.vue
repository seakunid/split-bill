<script setup lang="ts">
const { locale, setLocale, t } = useI18n()
</script>

<template>
  <header class="header">
    <NuxtLink to="/" class="brand">
      <span class="mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M5 3.5h10v11.2l-1.7-1-1.6 1-1.7-1-1.6 1-1.7-1L5 14.7V3.5z" fill="#fbf7f0"/>
          <path d="M7.2 7h5.6M7.2 9.5h5.6M7.2 12h3.4" stroke="#0b6e4f" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </span>
      {{ t('brand') }}
    </NuxtLink>
    <div class="lang" role="group" :aria-label="t('language')">
      <button type="button" :aria-pressed="locale === 'id'" @click="setLocale('id')">ID</button>
      <button type="button" :aria-pressed="locale === 'en'" @click="setLocale('en')">EN</button>
    </div>
  </header>
</template>
