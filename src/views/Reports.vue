<script setup>
import { onMounted, ref } from 'vue'
import api from '../api.js'
import VoidOrderModal from '../components/VoidOrderModal.vue'

const today = new Date().toISOString().slice(0, 10)
const dateFrom = ref(today)
const dateTo = ref(today)
const report = ref(null)
const loading = ref(false)
const error = ref('')
const storeName = ref('')
const printedAt = ref('')

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

const typeLabel = { dine_in: 'Dine In', take_away: 'Take Away', delivery: 'Delivery' }

const payBadge = {
  paid: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  unpaid: 'bg-muted text-muted-foreground',
  refunded: 'bg-destructive/10 text-destructive',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/api/reports/sales', {
      params: { date_from: dateFrom.value, date_to: dateTo.value },
    })
    report.value = data
  } catch (e) {
    error.value = e.response?.data?.errors
      ? Object.values(e.response.data.errors)[0][0]
      : e.response?.data?.message || 'Gagal memuat laporan.'
  } finally {
    loading.value = false
  }
}

function csvCell(cell) {
  return `"${String(cell ?? '').replaceAll('"', '""')}"`
}

function exportCsv() {
  if (!report.value) return
  const r = report.value
  const rows = [
    [`Laporan Penjualan ${r.date_from} s/d ${r.date_to}`],
    [],
    ['Ringkasan'],
    ['Nota', r.summary.orders_count],
    ['Omzet lunas', r.summary.paid_total],
    ['Belum bayar (sisa)', r.summary.outstanding_total],
    ['Rata-rata / nota lunas', r.summary.avg_paid_order],
    [],
    ['Per Metode Bayar'],
    ['Metode', 'Tipe', 'Nota', 'Nominal', 'Biaya Admin', 'Bersih'],
    ...r.by_method.map((m) => [m.name, m.type, m.count, m.amount, m.admin_fee, m.net]),
    [],
    ['Per Channel'],
    ['Channel', 'Nota', 'Subtotal', 'Fee'],
    ...r.by_channel.map((c) => [c.name, c.orders, c.subtotal, c.channel_fee]),
    [],
    ['Daftar Nota'],
    ['Jam', 'No Nota', 'Meja', 'Tipe', 'Status Bayar', 'Dapur', 'Metode', 'Total', 'Dibayar', 'HPP', 'Dibatalkan', 'Alasan Batal'],
    ...r.orders.map((o) => [
      o.created_at,
      o.order_number,
      o.table ?? '',
      typeLabel[o.order_type] ?? o.order_type,
      o.payment_status,
      o.kitchen_status,
      o.methods.join(' '),
      o.total_amount,
      o.paid_amount,
      o.total_cogs,
      o.voided ? 'YA' : '',
      o.void_reason ?? '',
    ]),
  ]

  // BOM supaya Excel membaca UTF-8 dengan benar.
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `laporan-${r.date_from}_${r.date_to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function printPage() {
  printedAt.value = new Date().toLocaleString('id-ID')
  // Beri waktu Vue merender blok khusus cetak sebelum dialog cetak terbuka.
  setTimeout(() => window.print(), 80)
}

// --- Void (modal alasan di VoidOrderModal.vue, dipakai bersama KDS/POS) ---
const voidTarget = ref(null)

function openVoid(o) {
  voidTarget.value = o
}

function onVoided() {
  voidTarget.value = null
  load()
}

onMounted(() => {
  load()
  // Nama outlet untuk kepala laporan cetak.
  api
    .get('/api/meta')
    .then(({ data }) => (storeName.value = data.store?.name ?? ''))
    .catch(() => {})
})
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="no-print mb-4 flex flex-wrap items-center gap-2">
      <h1 class="mr-2 m-0 text-xl font-bold">Laporan Penjualan</h1>
      <input v-model="dateFrom" type="date" class="w-[155px]" @change="load" />
      <span class="muted">s/d</span>
      <input v-model="dateTo" type="date" class="w-[155px]" @change="load" />
      <button class="btn-ghost btn-sm" :disabled="!report" @click="exportCsv">⬇ CSV</button>
      <button class="btn-ghost btn-sm" @click="printPage">🖨 Cetak</button>
      <span v-if="loading" class="muted">Memuat…</span>
      <span v-if="error" class="text-sm text-destructive">{{ error }}</span>
    </div>

    <!-- Kepala khusus cetak: hanya tampil di print, bukan di layar. -->
    <div class="mb-3 hidden print:block">
      <h1 class="m-0 text-lg font-bold">Laporan Penjualan{{ storeName ? ' — ' + storeName : '' }}</h1>
      <div class="text-sm">
        {{ report?.date_from }} s/d {{ report?.date_to }}
        <span v-if="printedAt"> · dicetak {{ printedAt }}</span>
      </div>
    </div>

    <template v-if="report">
      <div class="text-xs text-muted-foreground">
        Menampilkan {{ report.date_from }} s/d {{ report.date_to }}
        <span v-if="report.orders.length >= 2000">— dibatasi 2.000 nota teratas</span>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div class="card">
          <div class="muted">Nota</div>
          <div class="text-2xl font-bold">{{ report.summary.orders_count }}</div>
        </div>
        <div class="card">
          <div class="muted">Omzet lunas</div>
          <div class="rp text-2xl font-bold text-primary">{{ rp(report.summary.paid_total) }}</div>
        </div>
        <div class="card">
          <div class="muted">Rata-rata / nota lunas</div>
          <div class="rp text-2xl font-bold">{{ rp(report.summary.avg_paid_order) }}</div>
        </div>
        <div class="card">
          <div class="muted">Belum bayar (sisa)</div>
          <div class="rp text-2xl font-bold text-destructive">{{ rp(report.summary.outstanding_total) }}</div>
        </div>
        <div class="card">
          <div class="muted">Laba kotor (omzet − HPP)</div>
          <div class="rp text-2xl font-bold text-emerald-700">
            {{ rp(report.summary.gross_profit) }}
            <span class="muted block text-xs font-normal">
              HPP {{ rp(report.summary.cogs_total) }}
            </span>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="card">
          <h2 class="mb-2 mt-0 text-base font-bold">Per Metode Bayar</h2>
          <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs text-muted-foreground">
                <th class="py-1.5">Metode</th>
                <th>Nota</th>
                <th class="text-right">Nominal</th>
                <th class="text-right">Biaya Admin</th>
                <th class="text-right">Bersih</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in report.by_method" :key="m.name" class="border-b border-border/60">
                <td class="py-1.5 font-semibold">
                  {{ m.name }} <span class="muted text-xs">({{ m.type }})</span>
                </td>
                <td>{{ m.count }}</td>
                <td class="rp text-right">{{ rp(m.amount) }}</td>
                <td class="rp text-right text-destructive">−{{ rp(m.admin_fee) }}</td>
                <td class="rp text-right font-semibold">{{ rp(m.net) }}</td>
              </tr>
              <tr v-if="!report.by_method.length">
                <td colspan="5" class="muted py-3 text-center">Belum ada pembayaran.</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <div class="card">
          <h2 class="mb-2 mt-0 text-base font-bold">Per Channel</h2>
          <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs text-muted-foreground">
                <th class="py-1.5">Channel</th>
                <th>Nota</th>
                <th class="text-right">Subtotal</th>
                <th class="text-right">Fee Channel</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in report.by_channel" :key="c.name" class="border-b border-border/60">
                <td class="py-1.5 font-semibold">{{ c.name }}</td>
                <td>{{ c.orders }}</td>
                <td class="rp text-right">{{ rp(c.subtotal) }}</td>
                <td class="rp text-right text-destructive">−{{ rp(c.channel_fee) }}</td>
              </tr>
              <tr v-if="!report.by_channel.length">
                <td colspan="4" class="muted py-3 text-center">Belum ada nota.</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <div class="card mt-4">
        <h2 class="mb-2 mt-0 text-base font-bold">Daftar Nota ({{ report.orders.length }})</h2>
        <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs text-muted-foreground">
              <th class="py-1.5">Jam</th>
              <th>No. Nota</th>
              <th>Meja</th>
              <th>Tipe</th>
              <th>Bayar</th>
              <th>Dapur</th>
              <th>Metode</th>
              <th class="text-right">Total</th>
              <th class="text-right">HPP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in report.orders" :key="o.id" class="border-b border-border/60" :class="{ 'opacity-60': o.voided }">
              <td class="py-1.5 rp">{{ o.created_at }}</td>
              <td class="font-semibold" :class="{ 'line-through': o.voided }">{{ o.order_number }}</td>
              <td>{{ o.table ?? '—' }}</td>
              <td>{{ typeLabel[o.order_type] ?? o.order_type }}</td>
              <td>
                <span :class="payBadge[o.payment_status]" class="rounded px-2 py-0.5 text-xs font-semibold">
                  {{ o.payment_status }}
                </span>
              </td>
              <td class="muted">{{ o.kitchen_status }}</td>
              <td class="muted">{{ o.methods.join(', ') || '—' }}</td>
              <td class="text-right">
                <span class="rp font-semibold">{{ rp(o.total_amount) }}</span>
                <span v-if="o.payment_status === 'partial'" class="rp muted ml-1 text-xs">
                  (dibayar {{ rp(o.paid_amount) }})
                </span>
              </td>
              <td class="rp text-right text-muted-foreground">{{ rp(o.total_cogs) }}</td>
              <td class="whitespace-nowrap text-right">
                <span
                  v-if="o.voided"
                  class="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                  :title="o.void_reason"
                >
                  Dibatalkan<span v-if="o.payment_status === 'refunded'"> (refund)</span>
                </span>
                <button v-else class="btn-ghost btn-sm text-destructive" @click="openVoid(o)">
                  Batalkan
                </button>
              </td>
            </tr>
            <tr v-if="!report.orders.length">
              <td colspan="10" class="muted py-4 text-center">Belum ada nota pada rentang tanggal ini.</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </template>

    <VoidOrderModal :order="voidTarget" @close="voidTarget = null" @confirmed="onVoided" />
  </div>
</template>
