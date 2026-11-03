<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../api.js'
import { moneyFmt, onMoney } from '../money.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

const shift = ref(null)
const stats = ref(null)
const lastClosed = ref(null)
const history = ref([])
const storeId = ref(null)
const openingInput = ref('')
const closingInput = ref('')
const busy = ref(false)
const error = ref('')

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')
const fmt = (s) =>
  s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'

const expectedClosing = computed(
  () => Number(shift.value?.opening_balance || 0) + Number(stats.value?.cash_received || 0),
)
const previewDiff = computed(() =>
  closingInput.value === '' ? null : Number(closingInput.value) - expectedClosing.value,
)

async function load() {
  error.value = ''
  try {
    const [s, m, h] = await Promise.all([
      api.get('/api/shifts/current'),
      api.get('/api/meta'),
      api.get('/api/shifts'),
    ])
    shift.value = s.data.shift
    stats.value = s.data.stats ?? null
    storeId.value = m.data.store_id
    history.value = h.data.shifts
  } catch {
    error.value = 'Gagal memuat data shift.'
  }
}

onMounted(load)

async function openShift() {
  if (busy.value) return
  const balance = Number(openingInput.value)
  if (!openingInput.value || Number.isNaN(balance) || balance < 0) {
    error.value = 'Saldo buka wajib diisi (angka ≥ 0).'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const { data } = await api.post('/api/shifts/open', {
      store_id: storeId.value,
      opening_balance: balance,
    })
    shift.value = data.shift
    openingInput.value = ''
    await load()
  } catch (e) {
    error.value = e.response?.data?.message || 'Gagal membuka shift.'
  } finally {
    busy.value = false
  }
}

async function closeShift() {
  if (busy.value) return
  const actual = Number(closingInput.value)
  if (closingInput.value === '' || Number.isNaN(actual) || actual < 0) {
    error.value = 'Saldo hitung fisik wajib diisi (angka ≥ 0).'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const { data } = await api.post('/api/shifts/close', { actual_closing_balance: actual })
    lastClosed.value = data.shift
    shift.value = null
    stats.value = null
    closingInput.value = ''
    history.value = [data.shift, ...history.value]
  } catch (e) {
    error.value = e.response?.data?.message || 'Gagal menutup shift.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h1 class="m-0 text-xl font-bold">Shift Kasir</h1>
      <span class="muted text-sm">{{ auth.user?.name }} · {{ auth.user?.role }}</span>
    </div>

    <div v-if="error" class="mb-3 text-sm text-destructive">{{ error }}</div>

    <!-- Shift berjalan -->
    <template v-if="shift">
      <div class="card">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 class="m-0 text-base font-bold">Shift Berjalan</h2>
          <span class="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">OPEN</span>
        </div>
        <div class="muted grid gap-1 text-sm sm:grid-cols-2">
          <div>Dibuka: <b>{{ fmt(shift.opening_time) }}</b></div>
          <div>Saldo awal: <b class="rp">{{ rp(shift.opening_balance) }}</b></div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div class="card">
            <div class="muted text-xs">Nota</div>
            <div class="text-xl font-bold">{{ stats?.orders_count ?? 0 }}</div>
          </div>
          <div class="card">
            <div class="muted text-xs">Omzet lunas</div>
            <div class="rp text-xl font-bold text-primary">{{ rp(stats?.paid_total) }}</div>
          </div>
          <div class="card">
            <div class="muted text-xs">Tunai masuk</div>
            <div class="rp text-xl font-bold">{{ rp(stats?.cash_received) }}</div>
          </div>
          <div class="card">
            <div class="muted text-xs">Semua bayar</div>
            <div class="rp text-xl font-bold">{{ rp(stats?.all_received) }}</div>
          </div>
          <div class="card">
            <div class="muted text-xs">HPP</div>
            <div class="rp text-xl font-bold text-destructive">{{ rp(stats?.cogs_total) }}</div>
          </div>
        </div>
        <div class="muted mt-2 text-xs">
          Nota dibatalkan shift ini: {{ stats?.voided_count ?? 0 }} · Saldo harapan = saldo awal +
          tunai masuk = <b class="rp">{{ rp(expectedClosing) }}</b>
        </div>
      </div>

      <div class="card mt-4">
        <h2 class="mb-2 mt-0 text-base font-bold">Tutup Shift</h2>
        <p class="muted mb-2 text-sm">
          Hitung uang fisik di laci, lalu masukkan hasilnya. Selisih dibanding
          <b class="rp">{{ rp(expectedClosing) }}</b> (awal + tunai).
        </p>
        <div class="flex flex-wrap items-end gap-3">
          <label class="grid gap-1 text-xs text-muted-foreground">
            Hitung fisik (Rp)
            <input
              :value="moneyFmt(closingInput)"
              inputmode="numeric"
              class="w-48"
              placeholder="mis: 246.000"
              @input="onMoney($event, (d) => (closingInput = d))"
            />
          </label>
          <div
            v-if="previewDiff !== null"
            class="rounded px-3 py-2 text-sm font-bold"
            :class="previewDiff === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-destructive/10 text-destructive'"
          >
            Selisih: {{ previewDiff > 0 ? '+' : '' }}{{ rp(previewDiff) }}
          </div>
          <button class="btn-dark" :disabled="busy" @click="closeShift">
            {{ busy ? 'Memproses…' : 'Tutup Shift' }}
          </button>
        </div>
      </div>
    </template>

    <!-- Belum ada shift -->
    <div v-else class="card">
      <h2 class="mb-2 mt-0 text-base font-bold">Buka Shift</h2>
      <p class="muted mb-2 text-sm">
        Hitung uang awal di laci (kembalian) sebelum mulai melayani — angka ini jadi dasar hitung
        selisih saat tutup nanti.
      </p>
      <div class="flex flex-wrap items-end gap-3">
        <label class="grid gap-1 text-xs text-muted-foreground">
          Saldo buka (Rp)
          <input
            :value="moneyFmt(openingInput)"
            inputmode="numeric"
            class="w-48"
            placeholder="mis: 200.000"
            @input="onMoney($event, (d) => (openingInput = d))"
          />
        </label>
        <button class="btn-primary" :disabled="busy" @click="openShift">
          {{ busy ? 'Memproses…' : 'Buka Shift' }}
        </button>
      </div>
      <p v-if="!shift && !busy" class="muted mt-3 text-sm">
        Belum ada shift terbuka — kasir belum bisa mengaitkan penjualan ke sesi.
      </p>
    </div>

    <!-- Hasil shift terakhir -->
    <div v-if="lastClosed" class="card mt-4">
      <h2 class="mb-2 mt-0 text-base font-bold">Shift Terakhir Ditutup</h2>
      <div class="muted grid gap-1 text-sm sm:grid-cols-2">
        <div>Ditutup: <b>{{ fmt(lastClosed.closing_time) }}</b></div>
        <div>
          Harapan <b class="rp">{{ rp(lastClosed.expected_closing_balance) }}</b> · Fisik
          <b class="rp">{{ rp(lastClosed.actual_closing_balance) }}</b>
        </div>
      </div>
      <div
        class="mt-2 inline-block rounded px-3 py-1.5 text-sm font-bold"
        :class="Number(lastClosed.cash_difference) === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-destructive/10 text-destructive'"
      >
        Selisih kas: {{ Number(lastClosed.cash_difference) > 0 ? '+' : '' }}{{
          rp(lastClosed.cash_difference)
        }}
      </div>
    </div>

    <!-- Riwayat shift -->
    <div class="card mt-4">
      <h2 class="mb-2 mt-0 text-base font-bold">Riwayat Shift</h2>
      <p v-if="!history.length" class="muted text-sm">Belum ada shift tercatat.</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="muted border-b border-border text-left text-xs">
              <th class="py-1.5 pr-3 font-medium">Kasir</th>
              <th class="py-1.5 pr-3 font-medium">Buka</th>
              <th class="py-1.5 pr-3 font-medium">Tutup</th>
              <th class="py-1.5 pr-3 text-right font-medium">Saldo awal</th>
              <th class="py-1.5 pr-3 text-right font-medium">Harapan</th>
              <th class="py-1.5 pr-3 text-right font-medium">Fisik</th>
              <th class="py-1.5 text-right font-medium">Selisih</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.id" class="border-b border-border/60">
              <td class="py-1.5 pr-3">
                {{ h.user?.name ?? '—' }}
                <span
                  v-if="h.status === 'open'"
                  class="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                  >OPEN</span
                >
              </td>
              <td class="py-1.5 pr-3">{{ fmt(h.opening_time) }}</td>
              <td class="py-1.5 pr-3">{{ fmt(h.closing_time) }}</td>
              <td class="rp py-1.5 pr-3 text-right">{{ rp(h.opening_balance) }}</td>
              <td class="rp py-1.5 pr-3 text-right">{{ h.expected_closing_balance != null ? rp(h.expected_closing_balance) : '—' }}</td>
              <td class="rp py-1.5 pr-3 text-right">{{ h.actual_closing_balance != null ? rp(h.actual_closing_balance) : '—' }}</td>
              <td
                class="rp py-1.5 text-right font-semibold"
                :class="
                  h.cash_difference == null
                    ? 'text-muted-foreground'
                    : Number(h.cash_difference) === 0
                      ? 'text-emerald-600'
                      : 'text-destructive'
                "
              >
                {{ h.cash_difference == null ? '—' : (Number(h.cash_difference) > 0 ? '+' : '') + rp(h.cash_difference) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
