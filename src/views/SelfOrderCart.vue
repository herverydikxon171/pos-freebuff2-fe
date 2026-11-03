<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api.js'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const closed = ref(false)
const table = ref(null)
const session = ref(null)
const store = ref(null)
const order = ref(null)
const toast = ref(null)
let timer

// --- Bayar langsung dari HP (QRIS Midtrans) ---
const payState = ref(null) // null | 'qr' | 'paid' | 'expired' | 'failed'
const qrImage = ref('')
const grossAmount = ref(0)
const payBusy = ref(false)
let pollTimer

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(checkPay, 3000)
}

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

const items = computed(() => order.value?.items ?? [])

// Tracking dapur: item.station_status (di-update KDS) di-rollup backend ke order.kitchen_status.
const steps = ['Pesanan diterima', 'Sedang dimasak', 'Siap disajikan']

function stepIndex(status) {
  return { pending: 0, preparing: 1, ready: 2, completed: 2 }[status] ?? 0
}

const itemBadge = {
  pending: { label: 'Menunggu', cls: 'bg-muted text-muted-foreground' },
  preparing: { label: 'Dimasak', cls: 'bg-amber-100 text-amber-800' },
  ready: { label: 'Siap', cls: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Batal', cls: 'bg-destructive/10 text-destructive' },
}

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3500)
}

// Kembali ke daftar menu untuk menambah pesanan lain.
function backToMenu() {
  router.push({ name: 'selforder', params: { code: route.params.code } })
}

// Buat charge QRIS (server idempoten: charge pending dipakai ulang).
async function startPay() {
  if (payBusy.value) return
  payBusy.value = true
  try {
    const { data } = await api.post(`/api/qr/${route.params.code}/pay`)
    if (data.status === 'paid') {
      // Nota ternyata sudah lunas (mis. dibayar perangkat lain) → langsung struk.
      stopPoll()
      order.value = data.order
      payState.value = 'paid'
      return
    }
    qrImage.value = data.qr_image
    grossAmount.value = data.gross_amount
    payState.value = 'qr'
    startPoll()
  } catch (e) {
    showToast(e.response?.data?.message || 'Gagal membuat QR pembayaran.', true)
  } finally {
    payBusy.value = false
  }
}

// Poll status ke server (server yang mengecek Midtrans — HP tidak perlu webhook).
async function checkPay() {
  if (!order.value) return
  try {
    const { data } = await api.get(`/api/qr/${route.params.code}/pay-status/${order.value.id}`)
    if (data.status === 'paid') {
      stopPoll()
      order.value = data.order
      payState.value = 'paid'
      showToast('Pembayaran diterima ✓')
    } else if (data.status === 'expired') {
      stopPoll()
      payState.value = 'expired'
    } else if (data.status === 'failed') {
      stopPoll()
      payState.value = 'failed'
      showToast('Pembayaran gagal — coba buat QR baru.', true)
    }
  } catch {
    /* biarkan polling jalan — gangguan sesaat bukan kegagalan bayar */
  }
}

function retryPay() {
  payState.value = null
  startPay()
}

// Sembunyikan layar QR; charge pending tetap tersimpan dan dipakai ulang saat bayar lagi.
function cancelQr() {
  stopPoll()
  payState.value = null
}

function orderAgain() {
  stopPoll()
  payState.value = null
  backToMenu()
}

async function load() {
  try {
    const { data } = await api.get(`/api/qr/${route.params.code}`)
    session.value = data.session
    table.value = data.table
    store.value = data.store ?? store.value
    // Sesi ditutup (finalize menutup sesi begitu lunas) → struk tetap tampil,
    // baru jatuh ke halaman "sesi ditutup" bila memang tidak ada yang dibayar.
    if (data.closed) {
      if (data.paid_order) {
        order.value = data.paid_order
        payState.value = 'paid'
        stopPoll()
      } else if (payState.value !== 'paid') {
        closed.value = true
      }
      return
    }
    if (data.order) {
      order.value = data.order
      // Nota baru muncul setelah lunas → kembali ke tampilan keranjang.
      if (payState.value === 'paid') payState.value = null
    } else if (payState.value === 'qr') {
      // Nota hilang saat QR tayang → kemungkinan lunas di perangkat lain.
      checkPay()
    } else if (data.paid_order) {
      // Reload halaman setelah bayar → struk langsung tampil lagi.
      order.value = data.paid_order
      if (payState.value !== 'paid') payState.value = 'paid'
    }
  } catch (e) {
    if (e.response?.status === 404) closed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = setInterval(load, 10000)
})
onUnmounted(() => {
  clearInterval(timer)
  stopPoll()
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-4 pb-24 md:pb-6">
    <div v-if="loading" class="muted py-10 text-center">Memuat…</div>

    <div v-else-if="closed" class="card py-10 text-center">
      <div class="text-3xl">🔒</div>
      <p class="mt-2 font-semibold">Sesi pesanan sudah ditutup.</p>
      <p class="muted text-sm">Minta pelayan membuka sesi QR baru untuk meja ini.</p>
    </div>

    <template v-else>
      <!-- ===== MODE BAYAR: QR aktif / kedaluwarsa / gagal ===== -->
      <template v-if="payState === 'qr' || payState === 'expired' || payState === 'failed'">
        <div class="card mx-auto max-w-md py-6 text-center">
          <template v-if="payState === 'qr'">
            <div class="text-lg font-bold">Scan QR untuk bayar</div>
            <div class="rp my-3 text-3xl font-bold text-primary">{{ rp(grossAmount) }}</div>
            <img
              v-if="qrImage"
              :src="qrImage"
              alt="QRIS"
              class="mx-auto my-3 h-56 w-56 rounded-xl border border-border bg-white p-2"
            />
            <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span class="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
              Menunggu pembayaran…
            </div>
            <p class="muted mx-auto mt-2 max-w-xs text-xs">
              Scan dengan GoPay, BRImo, mBanking, atau app apa pun yang mendukung QRIS.
            </p>
          </template>
          <template v-else-if="payState === 'expired'">
            <div class="text-3xl">⌛</div>
            <p class="mt-2 font-semibold">QR kedaluwarsa.</p>
            <p class="muted text-sm">Buat QR baru untuk membayar.</p>
          </template>
          <template v-else>
            <div class="text-3xl">⚠️</div>
            <p class="mt-2 font-semibold">Pembayaran gagal.</p>
            <p class="muted text-sm">Coba buat QR baru, atau bayar di kasir.</p>
          </template>

          <div class="mt-4 flex justify-center gap-2">
            <button class="btn-ghost" @click="cancelQr">← Kembali</button>
            <button v-if="payState !== 'qr'" class="btn-primary" @click="retryPay">
              Buat QR Baru
            </button>
          </div>
        </div>
      </template>

      <!-- ===== MODE LUNAS: struk ===== -->
      <template v-else-if="payState === 'paid'">
        <div class="card mx-auto max-w-md py-6 text-center">
          <!-- Header struk: logo di atas, lalu identitas toko -->
          <div class="mb-4">
            <img
              v-if="store?.settings?.logo_url"
              :src="store.settings.logo_url"
              alt="Logo"
              class="mx-auto mb-1.5 h-14 w-auto object-contain"
            />
            <div class="text-base font-bold">{{ store?.name || 'Bakmie POS' }}</div>
            <div v-if="store?.address" class="muted text-xs">{{ store.address }}</div>
          </div>
          <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-800">
            ✓
          </div>
          <div class="mt-2 text-lg font-bold">Lunas — terima kasih!</div>
          <div class="muted text-sm">Nota {{ order?.order_number }} · QRIS</div>
          <div class="rp my-3 text-3xl font-bold text-primary">{{ rp(order?.total_amount) }}</div>
          <ul class="m-0 list-none space-y-1 border-t border-dashed border-border p-0 pt-3 text-left text-sm">
            <li v-for="it in items" :key="it.id" class="flex justify-between gap-2">
              <span>{{ it.quantity }}× {{ it.product_name_snapshot }}</span>
              <span class="rp">{{ rp(it.subtotal) }}</span>
            </li>
          </ul>
          <button class="btn-primary mt-4 w-full" @click="orderAgain">Pesan Lagi 🍜</button>
        </div>
      </template>

      <!-- ===== MODE KERANJANG (default) ===== -->
      <template v-else>
      <!-- Kepala halaman keranjang: judul + tombol kembali ke menu -->
      <div class="card mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 class="m-0 text-lg font-bold">🛒 Keranjang Meja {{ table?.table_number }}</h1>
          <div class="muted text-xs">
            {{ items.length }} item · kode sesi {{ session?.session_code }}
          </div>
        </div>
        <button class="btn-ghost btn-sm" @click="backToMenu">+ Tambah Menu</button>
      </div>

      <!-- Tracking status dapur (sinkron dari KDS lewat polling yang sudah ada). -->
      <div v-if="items.length" class="card mb-3">
        <template v-if="order.kitchen_status === 'cancelled'">
          <div class="text-sm font-semibold text-destructive">Pesanan dibatalkan</div>
          <p class="muted mt-1 text-xs">Hubungi kasir bila ada pertanyaan.</p>
        </template>
        <template v-else>
          <div class="mb-2.5 text-sm font-semibold">Status pesanan</div>
          <ol class="m-0 flex list-none items-start gap-1.5 p-0">
            <li v-for="(s, i) in steps" :key="s" class="flex flex-1 items-center gap-1.5">
              <span
                class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                :class="
                  i <= stepIndex(order.kitchen_status)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                "
              >
                {{ i < stepIndex(order.kitchen_status) ? '✓' : i + 1 }}
              </span>
              <span
                class="min-w-0 text-[11px] leading-tight"
                :class="i === stepIndex(order.kitchen_status) ? 'font-bold' : 'text-muted-foreground'"
              >
                {{ s }}
              </span>
              <span
                v-if="i < steps.length - 1"
                class="mt-3 h-0.5 w-3 shrink-0 rounded"
                :class="i < stepIndex(order.kitchen_status) ? 'bg-primary' : 'bg-muted'"
              ></span>
            </li>
          </ol>
        </template>
      </div>

      <div v-if="!items.length" class="card py-10 text-center">
        <div class="text-3xl">🧺</div>
        <p class="mt-2 font-semibold">Keranjang masih kosong.</p>
        <p class="muted mb-4 text-sm">Pilih menu dulu, lalu tambahkan ke nota meja.</p>
        <button class="btn-primary" @click="backToMenu">Pilih Menu</button>
      </div>

      <!-- Daftar item: kartu receipt modern (pill jumlah + ringkasan rapi) -->
      <ul v-else class="m-0 grid list-none gap-2.5 p-0">
        <li
          v-for="it in items"
          :key="it.id"
          class="card flex items-start gap-3.5 p-3.5"
        >
          <span
            class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-base font-bold text-primary"
          >
            {{ it.quantity }}×
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <span class="font-semibold leading-tight">{{ it.product_name_snapshot }}</span>
              <span class="rp shrink-0 font-bold">{{ rp(it.subtotal) }}</span>
            </div>

            <div class="mt-1.5 flex flex-wrap gap-1">
              <span
                v-if="itemBadge[it.station_status]"
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="itemBadge[it.station_status].cls"
              >
                {{ itemBadge[it.station_status].label }}
              </span>
              <span
                v-for="v in it.variants"
                :key="v.id"
                class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {{ v.variant_name_snapshot }}
              </span>
              <span
                v-for="a in it.addons"
                :key="a.id"
                class="rounded-full bg-muted px-2 py-0.5 text-xs text-card-foreground"
              >
                + {{ a.addon_name_snapshot }}
              </span>
            </div>

            <div class="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span v-if="it.participant_name" class="inline-flex items-center gap-1">
                👤 {{ it.participant_name }}
              </span>
              <span v-if="it.notes" class="inline-flex min-w-0 items-center gap-1">
                📝 <span class="truncate">{{ it.notes }}</span>
              </span>
            </div>
          </div>
        </li>
      </ul>

      <!-- Ringkasan total -->
      <div v-if="items.length" class="card mt-3">            <div class="flex items-center justify-between border-b border-dashed border-border pb-2.5 text-sm text-muted-foreground">
              <span>Item</span>
              <span>{{ items.length }}</span>
            </div>
        <div class="flex items-center justify-between pt-2.5 text-base font-bold">
          <span>Total (termasuk pajak & service)</span>
          <span class="rp text-primary">{{ rp(order.total_amount) }}</span>
        </div>
        <button class="btn-primary mt-3 w-full" :disabled="payBusy" @click="startPay">
          {{ payBusy ? 'Menyiapkan QR…' : '💳 Bayar Sekarang · QRIS' }}
        </button>
        <p class="muted mt-1.5 text-center text-xs">
          Bayar tunai tetap di kasir — atau bayar langsung dari HP ini.
        </p>
      </div>
      </template>
    </template>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
