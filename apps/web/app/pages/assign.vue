<script setup lang="ts">
import { ApiError } from '../../lib/api'
import { calculateSplit } from '@split-bill/shared'
import { formatRupiah } from '../../lib/money'
import { payerColor, payerInitial } from '../../lib/payers'
import { toBillWrite } from '../composables/useBillDraft'

definePageMeta({ middleware: 'draft' })

const { t } = useI18n()
const { api } = useBillApi()
const {
  draft,
  total,
  addPayer,
  removePayer,
  isAssigned,
  toggleAssignment,
  assignEveryone,
  clear,
} = useBillDraft()

useHead(() => ({ title: `${t('assign.title')} · ${t('brand')}` }))

const payerName = ref('')
const saving = ref(false)
const errorText = ref('')

const preview = computed(() =>
  calculateSplit({
    items: draft.value.items.map((item) => ({
      id: item.id,
      name: item.name.trim() || t('review.itemName'),
      lineTotal: item.lineTotal,
      assigneeIds: draft.value.assignments
        .filter((assignment) => assignment.itemId === item.id)
        .map((assignment) => assignment.payerId),
    })),
    payers: draft.value.payers.map((payer) => ({ id: payer.id, name: payer.name.trim() || t('assign.unnamed') })),
    tax: draft.value.tax,
    serviceCharge: draft.value.serviceCharge,
    discount: draft.value.discount,
    rounding: draft.value.rounding,
  }),
)

const unassignedCount = computed(() => preview.value.unassignedItemIds.length)
const gap = computed(() => total.value - preview.value.total)
const missingPayerName = computed(() => draft.value.payers.some((payer) => !payer.name.trim()))

const blockReason = computed(() => {
  if (draft.value.payers.length === 0) return t('assign.needPayer')
  if (missingPayerName.value) return t('assign.needName')
  if (unassignedCount.value > 0) return t('assign.needAssign')
  return ''
})

function shareCount(itemId: string) {
  return draft.value.assignments.filter((assignment) => assignment.itemId === itemId).length
}

function submitPayer() {
  addPayer(payerName.value)
  payerName.value = ''
}

async function save() {
  if (blockReason.value || saving.value) return
  saving.value = true
  errorText.value = ''
  try {
    const body = toBillWrite(draft.value)
    const saved = draft.value.billId ? await api.value.update(draft.value.billId, body) : await api.value.create(body)
    await navigateTo(`/b/${saved.id}`)
    clear()
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'UNKNOWN'
    const translated = t(`errors.${code}`)
    errorText.value = translated === `errors.${code}` ? t('errors.UNKNOWN') : translated
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section>
    <StepBar :step="3" />
    <p class="kicker">{{ draft.billId ? t('assign.editing') : t('assign.kicker') }}</p>
    <h1>{{ t('assign.title') }}</h1>
    <p class="lede">{{ t('assign.subtitle') }}</p>

    <form class="payer-form" @submit.prevent="submitPayer">
      <label class="sr-only" for="payer-name">{{ t('assign.payers') }}</label>
      <input id="payer-name" v-model="payerName" class="text-input" maxlength="120" :placeholder="t('assign.payerPlaceholder')">
      <button type="submit" class="btn btn-secondary" :disabled="!payerName.trim()">{{ t('assign.add') }}</button>
    </form>

    <div v-if="draft.payers.length" class="chips" :aria-label="t('assign.payers')">
      <span v-for="(payer, index) in draft.payers" :key="payer.id" class="chip">
        <span class="avatar" :style="{ background: payerColor(index) }">{{ payerInitial(payer.name) }}</span>
        {{ payer.name }}
        <button type="button" :aria-label="t('assign.removePayer', { name: payer.name })" @click="removePayer(payer.id)">×</button>
      </span>
    </div>
    <p v-else class="hint">{{ t('assign.emptyPayers') }}</p>

    <div v-if="unassignedCount > 0" class="banner" role="status">
      <strong>{{ unassignedCount === 1 ? t('assign.unassignedOne') : t('assign.unassignedMany', { count: unassignedCount }) }}</strong>
      <p>{{ t('assign.unassignedHint') }}</p>
    </div>

    <div class="stack">
      <article
        v-for="item in draft.items"
        :key="item.id"
        class="item-card"
        :class="{ missing: preview.unassignedItemIds.includes(item.id) }"
      >
        <div class="item-meta">
          <strong>{{ item.name }}</strong>
          <span class="money">{{ formatRupiah(item.lineTotal) }}</span>
        </div>
        <div class="item-meta">
          <span>× {{ item.quantity }}</span>
          <span v-if="shareCount(item.id) > 1">{{ t('assign.shared', { count: shareCount(item.id) }) }}</span>
        </div>
        <div class="toggles">
          <button
            v-for="(payer, index) in draft.payers"
            :key="payer.id"
            type="button"
            class="toggle"
            :aria-pressed="isAssigned(item.id, payer.id)"
            @click="toggleAssignment(item.id, payer.id)"
          >
            <span class="dot" :style="{ background: payerColor(index) }">{{ payerInitial(payer.name) }}</span>
            {{ payer.name }}
          </button>
          <button v-if="draft.payers.length > 1" type="button" class="btn btn-ghost" @click="assignEveryone(item.id)">
            {{ t('assign.everyone') }}
          </button>
        </div>
      </article>
    </div>

    <section v-if="draft.payers.length" class="live-card" :aria-label="t('assign.live')">
      <strong>{{ t('assign.live') }}</strong>
      <div v-for="(payer, index) in preview.breakdown" :key="payer.payerId" class="live-person">
        <span>
          <span class="dot" :style="{ background: payerColor(index) }">{{ payerInitial(payer.name) }}</span>
          {{ payer.name }}
        </span>
        <strong>{{ formatRupiah(payer.total) }}</strong>
      </div>
      <p v-if="gap !== 0" class="hint">{{ t('assign.gap', { amount: formatRupiah(gap) }) }}</p>
    </section>

    <div class="sticky-actions">
      <p v-if="errorText" class="banner banner-danger" role="alert">{{ errorText }}</p>
      <p v-else-if="blockReason" class="reason">{{ blockReason }}</p>
      <button type="button" class="btn btn-primary" :disabled="Boolean(blockReason) || saving" @click="save">
        {{ saving ? t('assign.saving') : draft.billId ? t('assign.update') : t('assign.save') }}
      </button>
      <NuxtLink class="btn btn-ghost" to="/review">{{ t('assign.back') }}</NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.payer-form .btn { flex: 0 0 auto; }
.sticky-actions { display: flex; flex-direction: column; gap: 8px; }
.live-person span { display: inline-flex; align-items: center; gap: 8px; }
</style>
