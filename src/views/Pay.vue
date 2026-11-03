<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import api from '../api.js'
import { moneyFmt, onMoney } from '../money.js'
import BillPrintArea from '../components/BillPrintArea.vue'
import { useCartStore } from '../stores/cart.js'

const route = useRoute()
const router = useRouter()

// Member kasir menempel di store bersama — dipakai untuk segarkan poin setelah bayar.
const { phone, member } = storeToRefs(useCartStore())

const loading = ref(true)
const missing = ref(false)
const order = ref(null)
const meta = ref(null)
const payRows = ref([])
const busy = ref(false)
const toast = ref(null)
const printedBillAt = ref('')
const bill = ref(null)

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')
const typeLabel = { dine_in: 'Dine In', take_away: 'Take Away', delivery: 'Delivery' }

// Sisa tagihan = total − pembayaran sukses tercatat (sama seperti backend).
const paidSoFar = (o) =>
  (o.payments ?? [])
    .filter((p) => p.status === 'success')
    .reduce((s, p) => s + Number(p.amount), 0)
const dueNow = (o) => Math.max(0, Number(o.total_amount) - paidSoFar(o))

const isPaid = computed(() => order.value?.payment_status === 'paid')
const isVoided = computed(() => !!order.value?.voided_at)
const sisa = computed(() => (order.value ? dueNow(order.value) : 0))

const settings = computed(
  () => meta.value?.store?.settings ?? { tax_percentage: 0, service_charge_percentage: 0 },
)

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3500)
}

function fillRows(amount) {
  payRows.value = [
    { payment_method_id: meta.value?.payment_methods?.[0]?.id ?? '', amount },
  ]
}

const methodType = (id) =>
  meta.value?.payment_methods?.find((m) => Number(m.id) === Number(id))?.type ?? ''

async function fetchOrder() {
  const { data } = await api.get(`/api/orders/${route.params.id}`)
  order.value = data.order
  return data.order
}

onMounted(async () => {
  try {
    const [o, m] = await Promise.all([
      api.get(`/api/orders/${route.params.id}`),
      api.get('/api/meta'),
    ])
    order.value = o.data.order
    meta.value = m.data
    if (!isPaid.value && !isVoided.value) fillRows(dueNow(order.value))
  } catch (e) {
    if (e.response?.status === 404) missing.value = true
    else showToast(e.response?.data?.message || 'Gagal memuat nota.', true)
  } finally {
    loading.value = false
  }
})

// Poin earn/redeem berubah saat lunas — segarkan saldo member yang menempel di POS.
async function refreshMember() {
  try {
    const { data } = await api.get('/api/customers/find', { params: { phone: phone.value } })
    member.value = data.customer
  } catch {
    /* biarkan data lama */
  }
}

async function submitPay() {
  if (busy.value || qrisBusy.value) return
  // Metode QRIS → jangan dicatat manual: buka modal QR & tunggu pelanggan scan.
  if (qrisOnly.value) {
    await openQrisModal()
    return
  }
  busy.value = true
  // Kembalian tunai = uang diterima − tagihan baris cash (dibawa ke toast saat lunas).
  const cashChange = payRows.value
    .filter((r) => methodType(r.payment_method_id) === 'cash' && Number(r.received ?? 0) > 0)
    .reduce((s, r) => s + Math.max(0, Number(r.received) - Number(r.amount)), 0)
  try {
    const { data } = await api.post(`/api/orders/${order.value.id}/pay`, {
      payments: payRows.value
        .filter((r) => Number(r.amount) > 0)
        .map(({ payment_method_id, amount }) => ({ payment_method_id, amount })),
    })
    // Jangan pernah bilang "Lunas" kalau nota masih kurang — kasir pegang uang asli.
    const sisaBaru = Math.max(
      0,
      Number(data.order.total_amount) - Number(data.paid_amount ?? data.order.total_amount),
    )
    await fetchOrder()
    if (sisaBaru > 0) {
      fillRows(sisaBaru)
      showToast(`Sebagian — ${data.order.order_number}, sisa ${rp(sisaBaru)}`)
    } else {
      payRows.value = []
      showToast(
        `Lunas — ${data.order.order_number} ${rp(data.order.total_amount)}` +
          (cashChange > 0 ? ` · Kembalian ${rp(cashChange)}` : ''),
      )
    }
    if (member.value) await refreshMember()
  } catch (e) {
    const d = e.response?.data
    showToast(
      (d?.errors ? Object.values(d.errors)[0][0] : d?.message) || 'Gagal memproses pembayaran.',
      true,
    )
    // Sinkronkan status kalau server menolak (mis. sudah lunas / dibatalkan).
    fetchOrder().catch(() => {})
  } finally {
    busy.value = false
  }
}

// --- QRIS: pilih metode QRIS → Bayar → modal QR + hitung mundur → lunas otomatis ---
const qrisImg = ref('')
const qrisUrl = ref('') // URL QR Midtrans — bisa disalin (kebutuhan simulator)
const qrisAmount = ref(0)
const qrisBusy = ref(false)
const qrisCountdown = ref('15:00') // sisa waktu QR sebelum kedaluwarsa
let qrisTimer // poll status nota
let qrisClock // penghitung mundur (detik)
let qrisDeadline = 0 // epoch ms waktu kedaluwarsa dari server
let qrisExpiredTick = false // cek status sekali saat menyentuh 00:00

function stopQrisPoll() {
  if (qrisTimer) {
    clearInterval(qrisTimer)
    qrisTimer = null
  }
  if (qrisClock) {
    clearInterval(qrisClock)
    qrisClock = null
  }
}

function hideQris() {
  stopQrisPoll()
  qrisImg.value = ''
  qrisUrl.value = ''
}

const qrisCancelBusy = ref(false)

// Tutup modal = batalkan QR di Midtrans (charge mati; tekan Bayar lagi → QR baru).
async function cancelQris() {
  if (qrisCancelBusy.value) return
  qrisCancelBusy.value = true
  try {
    await api.post(`/api/orders/${order.value.id}/qris/cancel`)
    hideQris()
    showToast('QRIS dibatalkan.')
  } catch (e) {
    showToast(e.response?.data?.message || 'Gagal membatalkan QRIS.', true)
  } finally {
    qrisCancelBusy.value = false
  }
}

// Hitung mundur ke expiry_time dari server; menyentuh 00:00 → sinkronkan status segera.
function startQrisClock(expiresAt) {
  qrisDeadline =
    (Number(expiresAt) > 0 ? Number(expiresAt) : Math.floor(Date.now() / 1000) + 15 * 60) * 1000
  qrisExpiredTick = false
  const tick = () => {
    const left = Math.max(0, Math.round((qrisDeadline - Date.now()) / 1000))
    qrisCountdown.value = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
    if (left === 0 && !qrisExpiredTick) {
      qrisExpiredTick = true
      checkQris()
    }
  }
  tick()
  if (qrisClock) clearInterval(qrisClock)
  qrisClock = setInterval(tick, 1000)
}

// Sudah lunas — tutup modal & tampilkan halaman berhasil.
async function finishPaid(o) {
  hideQris()
  payRows.value = []
  await fetchOrder()
  showToast(`Lunas — ${o.order_number} ${rp(o.total_amount)}`)
  if (member.value) await refreshMember()
}

// Semua baris pembayaran QRIS → bayar lewat modal QR, bukan catat manual.
const qrisOnly = computed(() => {
  const rows = payRows.value.filter((r) => Number(r.amount) > 0)
  if (!rows.length) return false
  const ids = new Set(
    (meta.value?.payment_methods ?? [])
      .filter((m) => m.type === 'qris')
      .map((m) => Number(m.id)),
  )
  return rows.every((r) => ids.has(Number(r.payment_method_id)))
})

async function openQrisModal() {
  if (qrisBusy.value) return
  qrisBusy.value = true
  try {
    const { data } = await api.post(`/api/orders/${order.value.id}/qris`)
    if (data.status === 'paid') {
      await finishPaid(data.order)
      return
    }
    qrisAmount.value = data.gross_amount ?? sisa.value
    qrisImg.value = data.qr_image
    qrisUrl.value = data.qr_url ?? ''
    stopQrisPoll() // bersihkan dulu — baru nyalakan jam & polling
    startQrisClock(data.expires_at)
    qrisTimer = setInterval(checkQris, 3000)
  } catch (e) {
    showToast(e.response?.data?.message || 'Gagal membuat QR QRIS.', true)
  } finally {
    qrisBusy.value = false
  }
}

// Salin URL QR Midtrans — untuk simulator/penguji pembayaran.
async function copyQrisUrl() {
  try {
    await navigator.clipboard.writeText(qrisUrl.value)
    showToast('URL QR disalin ✓')
    return
  } catch {
    /* clipboard API ditolak (permission/context) → fallback textarea */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = qrisUrl.value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    showToast('URL QR disalin ✓')
  } catch {
    showToast('Gagal menyalin — klik kolom lalu salin manual.', true)
  }
}

// Poll status QRIS — server ikut mengecek Midtrans, jadi lunas walau webhook tak terjangkau.
async function checkQris() {
  try {
    const { data } = await api.get(`/api/orders/${order.value.id}/qris/status`)
    const o = data.order
    if (data.status === 'paid' || o.payment_status === 'paid') await finishPaid(o)
    else if (o.payment_status === 'partial') {
      // QRIS menutup sebagian → tutup modal, sisanya bisa dibayar metode lain.
      hideQris()
      fillRows(dueNow(o))
      showToast(`Sebagian — ${o.order_number}, sisa ${rp(dueNow(o))}`)
    } else if (o.voided_at) {
      hideQris()
      showToast('Nota dibatalkan — QR ditutup.', true)
    } else if (data.status === 'failed' || data.status === 'expired') {
      // QR mati di Midtrans (kedaluwarsa/dibatalkan) — tutup & tawarkan QR baru.
      hideQris()
      await fetchOrder()
      showToast('QRIS kedaluwarsa — tekan Selesai Bayar untuk QR baru.', true)
    }
  } catch {
    /* gangguan sesaat — biarkan polling jalan */
  }
}

onUnmounted(stopQrisPoll)

// Cetak struk lewat komponen area cetak bersama — order sudah lengkap dari show().
function printBill() {
  printedBillAt.value = new Date().toLocaleString('id-ID')
  bill.value?.print()
}

function goPos() {
  router.push({ name: 'pos' })
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div class="mb-4 flex items-center justify-between gap-3">
      <h1 class="m-0 text-xl font-bold">💳 Bayar</h1>
      <button class="btn-ghost btn-sm" @click="goPos">← Kembali ke Kasir</button>
    </div>

    <div v-if="loading" class="muted py-10 text-center">Memuat…</div>

    <div v-else-if="missing" class="card py-10 text-center">
      <div class="text-3xl">🔎</div>
      <p class="mt-2 font-semibold">Nota tidak ditemukan.</p>
      <button class="btn-primary mt-3" @click="goPos">Kembali ke Kasir</button>
    </div>

    <template v-else-if="order">
      <div
        v-if="isVoided"
        class="mb-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
      >
        Nota dibatalkan — tidak dapat dibayar.
      </div>
      <div
        v-else-if="isPaid"
        class="mb-3 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800"
      >
        ✓ Lunas — {{ rp(order.total_amount) }} sudah diterima.
      </div>

      <!-- Ringkasan nota -->
      <div class="card mb-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-lg font-bold">{{ order.order_number }}</div>
            <div class="muted text-xs">
              {{ new Date(order.created_at).toLocaleString('id-ID') }}
              <span v-if="order.table"> · Meja {{ order.table.table_number }}</span>
              · {{ typeLabel[order.order_type] ?? order.order_type }}
            </div>
          </div>
          <span
            class="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-card-foreground"
          >
            {{ order.payment_status }}
          </span>
        </div>

        <div class="mt-3 grid gap-1.5 border-t border-dashed border-border pt-2.5 text-sm">
          <div v-for="it in order.items" :key="it.id">
            <div class="flex justify-between gap-2">
              <span>{{ it.quantity }}× {{ it.product_name_snapshot }}</span>
              <span class="rp">{{ rp(it.subtotal) }}</span>
            </div>
            <div v-if="it.variants?.length" class="text-xs text-muted-foreground">
              └ {{ it.variants.map((v) => v.variant_name_snapshot).join(', ') }}
            </div>
            <div v-if="it.addons?.length" class="text-xs text-muted-foreground">
              └ + {{ it.addons.map((a) => `${a.addon_name_snapshot} ×${a.quantity}`).join(', ') }}
            </div>
            <div v-if="it.participant_name" class="text-xs text-muted-foreground">
              👤 {{ it.participant_name }}
            </div>
            <div v-if="it.notes" class="text-xs text-muted-foreground">📝 {{ it.notes }}</div>
          </div>
        </div>

        <div class="mt-2.5 grid gap-1 border-t border-dashed border-border pt-2.5 text-sm">
          <div class="flex justify-between">
            <span>Subtotal</span>
            <span class="rp">{{ rp(order.subtotal) }}</span>
          </div>
          <div v-if="Number(order.discount_amount)" class="flex justify-between text-emerald-700">
            <span>Diskon poin</span>
            <span class="rp">−{{ rp(order.discount_amount) }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ settings.tax_name ?? 'Pajak' }} ({{ settings.tax_percentage }}%)</span>
            <span class="rp">{{ rp(order.tax_amount) }}</span>
          </div>
          <div class="flex justify-between">
            <span>Service ({{ settings.service_charge_percentage }}%)</span>
            <span class="rp">{{ rp(order.service_charge_amount) }}</span>
          </div>
          <div class="flex justify-between text-base font-bold">
            <span>Total</span>
            <span class="rp">{{ rp(order.total_amount) }}</span>
          </div>
          <div v-if="paidSoFar(order) > 0" class="flex justify-between text-emerald-700">
            <span>Sudah dibayar</span>
            <span class="rp">−{{ rp(paidSoFar(order)) }}</span>
          </div>
          <div v-if="!isPaid && !isVoided" class="flex justify-between text-base font-bold">
            <span class="text-destructive">Sisa tagihan</span>
            <span class="rp text-destructive">{{ rp(sisa) }}</span>
          </div>
        </div>
      </div>

      <!-- Form pembayaran (split bill: banyak baris metode) -->
      <div v-if="!isPaid && !isVoided" class="card">
        <h2 class="mb-2 mt-0 text-base font-bold">Pembayaran</h2>

        <div v-for="(r, i) in payRows" :key="i" class="mb-2 flex flex-wrap gap-2">
          <select v-model="r.payment_method_id" class="flex-1">
            <option v-for="m in meta?.payment_methods ?? []" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select>
          <input
            :value="moneyFmt(r.amount)"
            inputmode="numeric"
            class="w-[150px]"
            @input="onMoney($event, (d) => (r.amount = d))"
          />
          <button
            class="w-auto rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
            :disabled="payRows.length === 1"
            @click="payRows.splice(i, 1)"
          >
            ×
          </button>
          <!-- Tunai: uang diterima → kembalian langsung terhitung. -->
          <div
            v-if="methodType(r.payment_method_id) === 'cash'"
            class="flex w-full flex-wrap items-center gap-2 pl-1 text-sm"
          >
            <span class="muted">Uang diterima</span>
            <input
              :value="moneyFmt(r.received ?? 0)"
              inputmode="numeric"
              class="w-[140px]"
              placeholder="0"
              @input="onMoney($event, (d) => (r.received = d))"
            />
            <span
              v-if="Number(r.received ?? 0) > 0 && Number(r.received) >= Number(r.amount)"
              class="font-semibold text-emerald-700"
            >
              Kembalian {{ rp(Number(r.received) - Number(r.amount)) }}
            </span>
            <span
              v-else-if="Number(r.received ?? 0) > 0"
              class="font-semibold text-destructive"
            >
              Kurang {{ rp(Number(r.amount) - Number(r.received)) }}
            </span>
          </div>
        </div>
        <button
          class="btn-sm rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-border"
          @click="
            payRows.push({ payment_method_id: meta?.payment_methods?.[0]?.id ?? '', amount: 0 })
          "
        >
          + Tambah metode (Split Bill)
        </button>

        <div class="mt-4 flex items-center justify-end gap-2.5">
          <button class="btn-ghost" @click="goPos">Nanti</button>
          <button
            class="btn-dark"
            :disabled="busy || qrisBusy"
            @click="submitPay"
          >
            {{ busy ? 'Memproses…' : qrisBusy ? 'Menyiapkan QR…' : 'Selesai Bayar' }}
          </button>
        </div>
      </div>

      <!-- Sudah lunas -->
      <div v-else-if="isPaid && !isVoided" class="card text-center">
        <div class="text-3xl">✅</div>
        <p class="mt-1 font-semibold">Nota lunas.</p>
        <p class="muted text-sm">Simpan struk untuk pelanggan bila diminta.</p>
        <div class="mt-3 flex flex-wrap justify-center gap-2">
          <button class="btn-ghost" @click="printBill">🖨 Cetak Struk</button>
          <button class="btn-primary" @click="goPos">← Kembali ke Kasir</button>
        </div>
      </div>
    </template>

    <!-- Area cetak struk: komponen bersama dengan halaman Kasir. -->
    <BillPrintArea
      ref="bill"
      :order="order"
      :store-name="meta?.store?.name ?? ''"
      :store-address="meta?.store?.address ?? ''"
      :logo-url="meta?.store?.settings?.logo_url ?? ''"
      :settings="settings"
      :printed-at="printedBillAt"
    />

    <!-- Modal QRIS: QR + waktu tunggu; lunas otomatis → halaman berhasil menyusul. -->
    <div
      v-if="qrisImg"
      class="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-sm rounded-2xl bg-card p-5 text-center shadow-2xl">
        <div class="text-base font-bold">Scan QR untuk bayar</div>
        <div class="rp my-1 text-2xl font-bold text-primary">{{ rp(qrisAmount) }}</div>
        <img :src="qrisImg" alt="QRIS" class="mx-auto h-56 w-56" />
        <div class="muted mt-1.5 text-xs">
          ⏳ Menunggu pembayaran · sisa
          <span
            class="font-semibold tabular-nums"
            :class="{ 'text-destructive': qrisCountdown === '00:00' }"
          >
            {{ qrisCountdown }}
          </span>
        </div>
        <p class="muted mt-1 text-xs">
          Modal tertutup &amp; halaman berhasil tampil otomatis begitu pelanggan bayar; QR
          kedaluwarsa saat hitung mundur habis.
        </p>
        <!-- URL QR Midtrans: disalin untuk simulator/penguji pembayaran. -->
        <div v-if="qrisUrl" class="mt-2 flex items-center gap-1.5">
          <input
            :value="qrisUrl"
            readonly
            aria-label="URL QR Midtrans"
            class="min-w-0 flex-1 rounded border border-border bg-muted px-2 py-1 text-left font-mono text-xs"
            @focus="$event.target.select()"
          />
          <button class="btn-ghost btn-sm shrink-0" type="button" @click="copyQrisUrl">Salin</button>
        </div>
        <button class="btn-ghost btn-sm mt-3" :disabled="qrisCancelBusy" @click="cancelQris">
          {{ qrisCancelBusy ? 'Membatalkan…' : 'Batalkan QR' }}
        </button>
      </div>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
