<script setup lang="ts">
import { ApiError } from '../../lib/api'
import { clientErrorKey, uploadErrorKey } from '../../lib/api/parse-error'

const { t } = useI18n()
const { api, useMock } = useBillApi()
const { draft, startFromParsed, startManual, clear } = useBillDraft()

useHead(() => ({ title: t('brand') }))

type Phase = 'idle' | 'preview' | 'parsing' | 'error'

const phase = ref<Phase>('idle')
const selected = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const errorCode = ref('PARSE_FAILED')
const retryAfterSeconds = ref<number | null>(null)
const stage = ref(0)
const dragging = ref(false)
const cameraInput = ref<HTMLInputElement | null>(null)
const libraryInput = ref<HTMLInputElement | null>(null)

let stageTimer: ReturnType<typeof setInterval> | null = null

const hasDraft = computed(() => draft.value.items.length > 0)
const errorText = computed(() => {
  const key = clientErrorKey(errorCode.value, import.meta.dev)
  if (key === 'RATE_LIMITED') {
    return retryAfterSeconds.value == null
      ? t('errors.RATE_LIMITED')
      : t('errors.RATE_LIMITED_WAIT', { seconds: retryAfterSeconds.value })
  }
  const path = `errors.${key}`
  const translated = t(path)
  return translated === path ? t('errors.UNKNOWN') : translated
})

const stageText = computed(() => {
  if (stage.value <= 0) return t('upload.stage0')
  if (stage.value === 1) return t('upload.stage1')
  return t('upload.stage2')
})

function choose(file: File | undefined) {
  if (!file) return
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  selected.value = file
  previewUrl.value = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
  phase.value = 'preview'
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  choose(input.files?.[0])
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  choose(event.dataTransfer?.files?.[0])
}

async function runParse(file: File) {
  retryAfterSeconds.value = null
  phase.value = 'parsing'
  stage.value = 0
  stopStages()
  stageTimer = setInterval(() => {
    stage.value = Math.min(stage.value + 1, 2)
  }, 700)
  try {
    const parsed = await api.value.parse(file)
    startFromParsed(parsed)
    await navigateTo('/review')
  } catch (error) {
    phase.value = 'error'
    errorCode.value = error instanceof ApiError
      ? uploadErrorKey({ status: error.status, clientCode: error.code, serverCode: error.serverCode })
      : 'UNKNOWN'
    retryAfterSeconds.value = error instanceof ApiError ? (error.retryAfterSeconds ?? null) : null
  } finally {
    stopStages()
  }
}

function readSelected() {
  if (selected.value) void runParse(selected.value)
}

function trySample() {
  const file = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], 'sample-bill.jpg', { type: 'image/jpeg' })
  selected.value = file
  void runParse(file)
}

function enterManually() {
  startManual()
  void navigateTo('/review')
}

function stopStages() {
  if (stageTimer) clearInterval(stageTimer)
  stageTimer = null
}

onUnmounted(() => {
  stopStages()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <section>
    <StepBar :step="1" />
    <p class="kicker">{{ t('upload.kicker') }}</p>
    <h1>{{ t('upload.title') }}</h1>
    <p class="lede">{{ t('upload.subtitle') }}</p>

    <div
      v-if="phase === 'idle' || phase === 'error'"
      class="drop"
      :class="{ over: dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="drop-icon" aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect x="7" y="8" width="22" height="16" rx="3" stroke="#0b6e4f" stroke-width="1.8"/>
          <circle cx="14" cy="14" r="2" fill="#f0b429"/>
          <path d="M10 22l5.5-5 4 3.5L24 16l3 6H10z" fill="#0b6e4f"/>
        </svg>
      </div>
      <strong>{{ dragging ? t('upload.drop') : t('upload.idle') }}</strong>
    </div>

    <div v-if="phase === 'error'" class="banner banner-danger" role="alert">
      <p>{{ errorText }}</p>
    </div>

    <figure v-if="previewUrl && (phase === 'preview' || phase === 'parsing')" class="preview">
      <img :src="previewUrl" :alt="t('upload.previewLabel')">
    </figure>

    <div v-if="phase === 'parsing'" role="status">
      <p class="lede">{{ stageText }}</p>
      <div class="progress" aria-hidden="true"><span /></div>
    </div>

    <div v-if="phase !== 'parsing'" class="actions">
      <div v-if="phase === 'preview'" class="stack">
        <button type="button" class="btn btn-primary" @click="readSelected">{{ t('upload.read') }}</button>
        <button type="button" class="btn btn-secondary" @click="phase = 'idle'">{{ t('upload.retake') }}</button>
      </div>
      <template v-else>
        <div class="row">
          <button type="button" class="btn btn-primary" @click="cameraInput?.click()">{{ t('upload.take') }}</button>
          <button type="button" class="btn btn-secondary" @click="libraryInput?.click()">{{ t('upload.library') }}</button>
        </div>
        <button type="button" class="btn btn-ghost" @click="enterManually">
          {{ phase === 'error' ? t('upload.manualInstead') : t('upload.manual') }}
        </button>
        <button v-if="phase === 'error'" type="button" class="btn btn-secondary" @click="phase = 'idle'">
          {{ t('upload.retry') }}
        </button>
        <button v-if="useMock && phase !== 'error'" type="button" class="btn btn-ghost" @click="trySample">
          {{ t('upload.sample') }}
        </button>
        <p v-if="useMock && phase !== 'error'" class="hint">{{ t('upload.sampleHint') }}</p>
      </template>
    </div>

    <input ref="cameraInput" class="sr-only" type="file" accept="image/*" capture="environment" :aria-label="t('upload.take')" @change="onPick">
    <input ref="libraryInput" class="sr-only" type="file" accept="image/*" :aria-label="t('upload.library')" @change="onPick">

    <aside v-if="hasDraft && phase === 'idle'" class="continue-card">
      <strong>{{ t('upload.continueTitle') }}</strong>
      <p>{{ draft.items.length }} item · {{ draft.currency }}</p>
      <div class="row">
        <NuxtLink class="btn btn-secondary" to="/review">{{ t('upload.continue') }}</NuxtLink>
        <button type="button" class="btn btn-ghost" @click="clear">{{ t('upload.discard') }}</button>
      </div>
    </aside>
  </section>
</template>
