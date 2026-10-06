<script setup lang="ts">
import { formatRupiah } from '../../lib/money'
import type { DraftItem } from '../composables/useBillDraft'

definePageMeta({ middleware: 'draft' })

const { t } = useI18n()
const { draft, subtotal, total, addItem, removeItem, setQuantity, setUnitPrice } = useBillDraft()

useHead(() => ({ title: `${t('review.title')} · ${t('brand')}` }))

const nameError = ref(false)
const list = ref<HTMLElement | null>(null)

const missingName = computed(() => draft.value.items.some((item) => !item.name.trim()))

async function onAdd() {
  addItem()
  nameError.value = false
  await nextTick()
  const inputs = list.value?.querySelectorAll<HTMLInputElement>('input.item-name')
  inputs?.[inputs.length - 1]?.focus()
}

function onQuantity(item: DraftItem, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  setQuantity(item, value)
}

function goNext() {
  if (draft.value.items.length === 0 || missingName.value) {
    nameError.value = true
    return
  }
  void navigateTo('/assign')
}
</script>

<template>
  <section>
    <StepBar :step="2" />
    <p class="kicker">{{ draft.billId ? t('review.editing') : t('review.kicker') }}</p>
    <h1>{{ t('review.title') }}</h1>
    <p class="lede">{{ t('review.subtitle') }}</p>

    <div v-if="nameError" class="banner" role="alert">
      <p>{{ draft.items.length === 0 ? t('review.empty') : t('review.nameRequired') }}</p>
    </div>
    <div v-if="total < 0" class="banner">
      <p>{{ t('review.negative') }}</p>
    </div>

    <div ref="list" class="stack">
      <article v-for="item in draft.items" :key="item.id" class="item-card">
        <div class="item-top">
          <label class="sr-only" :for="`name-${item.id}`">{{ t('review.itemName') }}</label>
          <input
            :id="`name-${item.id}`"
            v-model="item.name"
            class="item-name"
            maxlength="200"
            :placeholder="t('review.itemPlaceholder')"
            @input="nameError = false"
          >
          <button
            type="button"
            class="icon-btn"
            :aria-label="item.name ? t('review.remove', { name: item.name }) : t('review.removeItem')"
            @click="removeItem(item.id)"
          >
            ×
          </button>
        </div>
        <div class="item-grid">
          <div>
            <span class="mini-label">{{ t('review.qty') }}</span>
            <div class="stepper">
              <button type="button" :aria-label="t('review.decrease')" @click="setQuantity(item, item.quantity - 1)">−</button>
              <input
                class="qty-input"
                :value="item.quantity"
                inputmode="numeric"
                :aria-label="t('review.qty')"
                @input="onQuantity(item, $event)"
              >
              <button type="button" :aria-label="t('review.increase')" @click="setQuantity(item, item.quantity + 1)">+</button>
            </div>
          </div>
          <MoneyField
            :id="`price-${item.id}`"
            :label="t('review.price')"
            :model-value="item.unitPrice"
            @update:model-value="setUnitPrice(item, $event)"
          />
          <div class="line-total">
            <span class="mini-label">{{ t('review.lineTotal') }}</span>
            <strong class="money">{{ formatRupiah(item.lineTotal) }}</strong>
          </div>
        </div>
      </article>
    </div>

    <p v-if="draft.items.length === 0" class="empty">{{ t('review.empty') }}</p>

    <button type="button" class="btn btn-secondary add-item" @click="onAdd">{{ t('review.add') }}</button>

    <section class="totals" :aria-label="t('review.total')">
      <div class="total-row">
        <span>{{ t('review.subtotal') }}</span>
        <strong class="money">{{ formatRupiah(subtotal) }}</strong>
      </div>
      <div class="fee-row">
        <MoneyField id="tax" :label="t('review.tax')" v-model="draft.tax" :hint="t('review.taxHint')" />
      </div>
      <div class="fee-row">
        <MoneyField id="service" :label="t('review.service')" v-model="draft.serviceCharge" />
      </div>
      <div class="fee-row">
        <MoneyField id="discount" :label="t('review.discount')" v-model="draft.discount" />
      </div>
      <div class="fee-row">
        <MoneyField id="rounding" :label="t('review.rounding')" v-model="draft.rounding" signed :hint="t('review.roundingHint')" />
      </div>
      <p class="hint formula">{{ t('review.formula') }}</p>
      <div class="grand">
        <span>{{ t('review.total') }}</span>
        <strong>{{ formatRupiah(total) }}</strong>
      </div>
    </section>

    <div class="sticky-actions stack">
      <button type="button" class="btn btn-primary" :disabled="draft.items.length === 0" @click="goNext">
        {{ t('review.next') }}
      </button>
      <NuxtLink class="btn btn-ghost" to="/">{{ t('review.back') }}</NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.add-item { margin-top: 12px; }
.totals .fee-row { display: block; border-bottom: 0; padding: 4px 0; }
.formula { margin: 8px 0 0; }
</style>
