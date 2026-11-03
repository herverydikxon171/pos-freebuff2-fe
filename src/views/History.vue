<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api.js'
import BillPrintArea from '../components/BillPrintArea.vue'
import VoidOrderModal from '../components/VoidOrderModal.vue'

const router = useRouter()

const loading = ref(true)
const orders = ref([])
const meta = ref(null)
const voidTarget = ref(null)
const toast = ref(null)
const printOrder = ref(null)
const printedBillAt = ref('')
const bill = ref(null)

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')
const typeLabel = { dine_in: 'Dine In', take_away: 'Take Away', delivery: 'Delivery' }

const payBadge = {
  paid: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  unpaid: 'bg-muted text-muted-foreground',
  refunded: 'bg-destructive/10 text-destructive',
}

const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3500)
}

function showError(e) {
  const d = e.response?.data
  showToast(
    (d?.errors ? Object.values(d.errors)[0][0] : d?.message) || 'Terjadi kesalahan.',
    true,
  )
}

async function load() {
  loading.value = true
  try {
    // Tanpa parameter = laporan hari ini (sudah menyertakan nota voided + alasan).
    const { data } = await api.get('/api/reports/sales')
    orders.value = data.orders
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  // Nama outlet & pengaturan pajak untuk kepala/isi struk cetak.
  api
    .get('/api/meta')
    .then(({ data }) => (meta.value = data))
    .catch(() => {})
})

// Bayar = pindah halaman ke /bayar/:id (halaman bayar terpisah).
function goPay(o) {
  router.push({ name: 'pay', params: { id: o.id } })
}

function onVoided() {
  voidTarget.value = null
  load()
  showToast('Nota dibatalkan.')
}

async function printBill(o) {
  try {
    const { data } = await api.get(`/api/orders/${o.id}`)
    printOrder.value = data.order
  } catch (e) {
    showError(e)
    return
  }
  printedBillAt.value = new Date().toLocaleString('id-ID')
  bill.value?.print()
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-xl font-bold">🧾 Riwayat Nota Hari Ini</h1>
        <div class="muted text-xs">{{ today }} · {{ orders.length }} nota</div>
      </div>
      <button class="btn-ghost btn-sm" @click="router.push({ name: 'pos' })">
        ← Kembali ke Kasir
      </button>
    </div>

    <div v-if="loading" class="muted py-10 text-center">Memuat…</div>

    <div v-else-if="!orders.length" class="card py-10 text-center">
      <div class="text-3xl">🧺</div>
      <p class="mt-2 font-semibold">Belum ada nota hari ini.</p>
    </div>

    <ul v-else class="m-0 grid list-none gap-0 p-0">
      <li
        v-for="o in orders"
        :key="o.id"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-1 py-2.5 text-sm"
        :class="{ 'opacity-60': o.voided }"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold" :class="{ 'line-through': o.voided }">
              {{ o.order_number }}
            </span>
            <span class="muted text-xs">{{ o.created_at }}</span>
            <span
              :class="payBadge[o.payment_status]"
              class="rounded px-2 py-0.5 text-xs font-semibold"
            >
              {{ o.payment_status }}
            </span>
            <span
              v-if="o.kitchen_status"
              class="rounded bg-muted px-2 py-0.5 text-xs text-card-foreground"
            >
              dapur: {{ o.kitchen_status }}
            </span>
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ typeLabel[o.order_type] ?? o.order_type }}
            <span v-if="o.table"> · Meja {{ o.table }}</span>
            <span v-if="o.methods?.length"> · {{ o.methods.join(', ') }}</span>
          </div>
          <div v-if="o.voided" class="text-xs text-destructive">
            Dibatalkan<span v-if="o.payment_status === 'refunded'"> (refund)</span>:
            {{ o.void_reason }}
          </div>
        </div>
        <div class="flex items-center gap-2 whitespace-nowrap">
          <span class="rp font-semibold">{{ rp(o.total_amount) }}</span>
          <button class="btn-ghost btn-sm" title="Cetak bill" @click="printBill(o)">🖨</button>
          <template v-if="!o.voided">
            <button
              v-if="o.payment_status !== 'paid'"
              class="btn-ghost btn-sm"
              @click="goPay(o)"
            >
              Bayar
            </button>
            <button class="btn-ghost btn-sm text-destructive" @click="voidTarget = o">
              Batalkan
            </button>
          </template>
          <span v-else class="text-xs font-semibold text-destructive">Dibatalkan</span>
        </div>
      </li>
    </ul>

    <VoidOrderModal :order="voidTarget" @close="voidTarget = null" @confirmed="onVoided" />

    <!-- Area cetak struk: komponen bersama dengan halaman Kasir & Bayar. -->
    <BillPrintArea
      ref="bill"
      :order="printOrder"
      :store-name="meta?.store?.name ?? ''"
      :store-address="meta?.store?.address ?? ''"
      :logo-url="meta?.store?.settings?.logo_url ?? ''"
      :settings="meta?.store?.settings"
      :printed-at="printedBillAt"
    />

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
