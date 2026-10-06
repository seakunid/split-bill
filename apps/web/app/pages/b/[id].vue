<script setup lang="ts">
import { ApiError } from '../../../lib/api'
import { clientErrorKey } from '../../../lib/api/parse-error'
import type { BillResponse } from '@split-bill/shared'
import { formatRupiah } from '../../../lib/money'
import { payerColor, payerInitial } from '../../../lib/payers'

const route = useRoute()
const { t } = useI18n()
const { api, useMock } = useBillApi()
const { startFromBill } = useBillDraft()

const bill = ref<BillResponse | null>(null)
const loading = ref(true)
const errorCode = ref('')
const copied = ref(false)
const canNativeShare = ref(false)
const shareUrl = ref('')

useHead(() => ({ title: `${t('share.title')} · ${t('brand')}` }))

const id = computed(() => {
  const param = route.params.id
  return Array.isArray(param) ? (param[0] ?? '') : (param ?? '')
})

onMounted(async () => {
  shareUrl.value = window.location.href
  canNativeShare.value = typeof navigator.share === 'function'
  try {
    bill.value = await api.value.get(id.value)
  } catch (error) {
    errorCode.value = clientErrorKey(error instanceof ApiError ? error.code : 'UNKNOWN', import.meta.dev)
  } finally {
    loading.value = false
  }
})

function shareCount(itemId: string) {
  if (!bill.value) return 0
  return bill.value.assignments.filter((assignment) => assignment.itemId === itemId).length
}

function quantity(itemId: string) {
  return bill.value?.items.find((item) => item.id === itemId)?.quantity ?? 1
}

async function copyLink() {
  const url = shareUrl.value || window.location.href
  // Show the confirmation immediately. clipboard.writeText can hang when the
  // browser is waiting on a permission prompt, which would otherwise hide it.
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 2500)
  try {
    const write = navigator.clipboard?.writeText(url)
    if (!write) throw new Error('Clipboard unavailable')
    await Promise.race([
      write,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('Clipboard timed out')), 400)
      }),
    ])
  } catch {
    const input = document.createElement('textarea')
    input.value = url
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
}

async function nativeShare() {
  if (!navigator.share) {
    await copyLink()
    return
  }
  try {
    await navigator.share({ title: t('brand'), url: shareUrl.value || window.location.href })
  } catch {
    // The share sheet was dismissed.
  }
}

function edit() {
  if (!bill.value) return
  startFromBill(bill.value)
  void navigateTo('/review')
}
</script>

<template>
  <section>
    <p class="kicker">{{ t('share.kicker') }}</p>
    <h1>{{ t('share.title') }}</h1>

    <p v-if="loading" role="status">{{ t('share.loading') }}</p>

    <div v-else-if="errorCode" class="empty">
      <h2>{{ errorCode === 'NOT_FOUND' ? t('share.notFoundTitle') : t('share.errorTitle') }}</h2>
      <p class="lede">{{ errorCode === 'NOT_FOUND' && useMock ? t('errors.NOT_FOUND_MOCK') : t(`errors.${errorCode}`) }}</p>
      <NuxtLink class="btn btn-primary" to="/">{{ t('share.home') }}</NuxtLink>
    </div>

    <template v-else-if="bill">
      <article class="receipt">
        <div class="receipt-top" aria-hidden="true" />
        <div class="receipt-body">
          <section v-for="(payer, index) in bill.breakdown" :key="payer.payerId" class="payer-block">
            <h2 class="payer-name">
              <span class="avatar" :style="{ background: payerColor(index) }">{{ payerInitial(payer.name) }}</span>
              {{ payer.name }}
            </h2>
            <div v-for="item in payer.items" :key="item.itemId" class="share-row">
              <span>
                {{ item.name }}
                <template v-if="quantity(item.itemId) > 1"> × {{ quantity(item.itemId) }}</template>
                <template v-if="shareCount(item.itemId) > 1"> · {{ t('share.shared', { count: shareCount(item.itemId) }) }}</template>
              </span>
              <strong class="money">{{ formatRupiah(item.share) }}</strong>
            </div>
            <div class="fee-row">
              <span>{{ t('share.subtotal') }}</span>
              <strong class="money">{{ formatRupiah(payer.subtotal) }}</strong>
            </div>
            <div v-if="payer.tax" class="fee-row">
              <span>{{ t('share.tax') }}</span>
              <strong class="money">{{ formatRupiah(payer.tax) }}</strong>
            </div>
            <div v-if="payer.serviceCharge" class="fee-row">
              <span>{{ t('share.service') }}</span>
              <strong class="money">{{ formatRupiah(payer.serviceCharge) }}</strong>
            </div>
            <div v-if="payer.discount" class="fee-row">
              <span>{{ t('share.discount') }}</span>
              <strong class="money">−{{ formatRupiah(payer.discount) }}</strong>
            </div>
            <div v-if="payer.rounding" class="fee-row">
              <span>{{ t('share.rounding') }}</span>
              <strong class="money">{{ formatRupiah(payer.rounding) }}</strong>
            </div>
            <div class="grand">
              <span>{{ t('share.owes') }}</span>
              <strong>{{ formatRupiah(payer.total) }}</strong>
            </div>
          </section>
          <div class="grand">
            <span>{{ t('share.grand') }}</span>
            <strong>{{ formatRupiah(bill.total) }}</strong>
          </div>
        </div>
      </article>

      <div class="sticky-actions stack">
        <button type="button" class="btn btn-primary" @click="copyLink">
          {{ copied ? t('share.copied') : t('share.copy') }}
        </button>
        <button v-if="canNativeShare" type="button" class="btn btn-secondary" @click="nativeShare">{{ t('share.share') }}</button>
        <button type="button" class="btn btn-ghost" @click="edit">{{ t('share.edit') }}</button>
        <p class="share-url">{{ shareUrl }}</p>
      </div>
    </template>
  </section>
</template>
