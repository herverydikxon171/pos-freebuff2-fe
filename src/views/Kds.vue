<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import draggable from 'vuedraggable'
import api from '../api.js'
import VoidOrderModal from '../components/VoidOrderModal.vue'

const orders = ref([])
const history = ref([])
const view = ref('board') // 'board' | 'history'
const toast = ref(null)
const voidOrder = ref(null)
const now = ref(Date.now())
let timer
let ticker

// --- Papan kanban: kolom = tahap dapur, kartu digeser antar kolom. ---
const COLUMNS = [
  { key: 'pending', label: '⏳ Menunggu' },
  { key: 'preparing', label: '🔥 Dimasak' },
  { key: 'ready', label: '✅ Siap' },
  { key: 'completed', label: '🛎 Disajikan' },
]

const columns = ref(COLUMNS.map((c) => ({ ...c, cards: [] })))
const activeFilter = ref('all') // 'all' | id stasiun
const dragging = ref(false)
const patching = ref(false)

// Stasiun yang sedang ada di papan — jadi pilihan chip filter.
const stationOptions = computed(() => {
  const map = new Map()
  for (const order of orders.value) {
    for (const item of order.items) {
      if (item.station_status === 'cancelled') continue
      const id = item.kitchen_station_id ?? 0
      if (!map.has(id)) map.set(id, { id, name: item.station?.name ?? 'Tanpa Stasiun' })
    }
  }
  return [...map.values()]
})

// Susun ulang kartu ke kolom status (dipanggil setelah load & ganti filter).
function rebuildColumns() {
  const byStatus = Object.fromEntries(COLUMNS.map((c) => [c.key, []]))
  for (const order of orders.value) {
    for (const item of order.items) {
      if (item.station_status === 'cancelled') continue
      if (activeFilter.value !== 'all' && (item.kitchen_station_id ?? 0) !== activeFilter.value) continue
      byStatus[item.station_status]?.push({ key: item.id, order, item })
    }
  }
  columns.value = COLUMNS.map((c) => ({ ...c, cards: byStatus[c.key] }))
}

function setFilter(id) {
  activeFilter.value = id
  rebuildColumns()
}

// Jatuhnya kartu di kolom lain → PATCH status (endpoint lama, tanpa guard transisi).
async function onDrop(col, evt) {
  if (!evt.added) return
  patching.value = true
  try {
    await advance(evt.added.element.item, col.key)
  } finally {
    patching.value = false
    dragging.value = false
  }
}

function onDragEnd() {
  // Kalau tidak ada patch (geser dalam kolom yang sama), langsung lepas jeda refresh.
  if (!patching.value) dragging.value = false
}

const statusBorder = {
  pending: 'border-l-gray-400',
  preparing: 'border-l-amber-500',
  ready: 'border-l-emerald-500',
  completed: 'border-l-sky-500',
}

// --- Waktu: jam/tanggal pemesanan + lama berjalan (tick tiap detik). ---
function clock(ts) {
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(ts) {
  return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function minutesSince(ts) {
  return Math.max(0, Math.floor((now.value - new Date(ts).getTime()) / 60000))
}

function ageLabel(ts) {
  const m = minutesSince(ts)
  return m < 60 ? `${m} mnt` : `${Math.floor(m / 60)} j ${m % 60} mnt`
}

// Warna badge lama pesanan: <10 mnt hijau, 10–20 mnt kuning, >20 mnt merah.
function ageTone(ts) {
  const m = minutesSince(ts)
  return m >= 20
    ? 'bg-destructive/10 text-destructive'
    : m >= 10
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800'
}

// Lama item berada di status dapur saat ini — updated_at ikut berubah saat status di-patch.
function itemStatusAge(item) {
  const label =
    { pending: 'Menunggu', preparing: 'Dimasak', ready: 'Siap' }[item.station_status] ??
    item.station_status
  return `${label} ${ageLabel(item.updated_at)}`
}

const histLabel = {
  completed: 'Disajikan',
  cancelled: 'Dibatalkan',
  ready: 'Siap',
  preparing: 'Dimasak',
  pending: 'Menunggu',
}

// Pembatalan hanya untuk nota yang belum ada menu matang (ready/completed).
// Begitu ada satu item selesai dimasak, nota tidak bisa dibatalkan dari KDS.
function canVoid(order) {
  return !order.items.some((i) => ['ready', 'completed'].includes(i.station_status))
}

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3000)
}

async function load() {
  try {
    const { data } = await api.get('/api/orders', { params: { active: 1 } })
    orders.value = data.orders
    rebuildColumns()
  } catch {
    /* biarkan tampilan lama saat request berikutnya berhasil */
  }
  if (view.value === 'history') loadHistory()
}

async function loadHistory() {
  try {
    const { data } = await api.get('/api/orders', { params: { history: 1 } })
    history.value = data.orders
  } catch {
    /* biarkan tampilan lama */
  }
}

function openHistory() {
  view.value = 'history'
  loadHistory()
}

onMounted(() => {
  load()
  // Auto-refresh dijeda saat ada kartu digenggam supaya tidak lompat di tangan.
  timer = setInterval(() => {
    if (!dragging.value) load()
  }, 5000)
  // Tick detik supaya badge lama waktu ikut bergerak walau tidak ada pesanan baru.
  ticker = setInterval(() => (now.value = Date.now()), 1000)
})

onUnmounted(() => {
  clearInterval(timer)
  clearInterval(ticker)
})

async function advance(item, next) {
  try {
    await api.patch(`/api/orders/${item.order_id}/items/${item.id}`, {
      station_status: next,
    })
    await load()
  } catch (e) {
    // Gagal → muat ulang supaya kartu yang tadi digeser kembali ke tempatnya.
    showToast(e.response?.data?.message || 'Gagal memperbarui status.', true)
    await load()
  }
}

function onVoided() {
  voidOrder.value = null
  load()
  showToast('Nota dibatalkan.')
}
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <h2 class="m-0 mr-auto text-xl font-bold">👨‍🍳 Kitchen Display</h2>
      <button
        :class="view === 'board' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'"
        @click="view = 'board'"
      >
        🔥 Papan
      </button>
      <button
        :class="view === 'history' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'"
        @click="openHistory"
      >
        📚 Riwayat
      </button>
      <span class="muted hidden text-xs sm:inline">auto-refresh tiap 5 detik</span>
    </div>

    <!-- ================= PAPAN KANBAN ================= -->
    <template v-if="view === 'board'">
      <div v-if="!orders.length" class="card muted py-10 text-center">Tidak ada pesanan aktif. 🎉</div>

      <template v-else>
        <!-- Filter stasiun -->
        <div class="mb-3 flex flex-wrap gap-2">
          <button
            :class="activeFilter === 'all' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'"
            @click="setFilter('all')"
          >
            Semua
          </button>
          <button
            v-for="st in stationOptions"
            :key="st.id"
            :class="activeFilter === st.id ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'"
            @click="setFilter(st.id)"
          >
            {{ st.name }}
          </button>
        </div>

        <!-- Kolom status; kartu digeser (drag & drop) antar kolom. -->
        <div class="flex items-start gap-3.5 overflow-x-auto pb-2">
          <div v-for="col in columns" :key="col.key" class="flex w-[300px] shrink-0 flex-col">
            <div class="rounded-t-lg bg-header px-3.5 py-2 text-sm font-semibold text-header-foreground">
              {{ col.label }} · {{ col.cards.length }}
            </div>

            <draggable
              v-model="col.cards"
              group="kds"
              item-key="key"
              :delay="150"
              :delay-on-touch-only="true"
              :touch-start-threshold="4"
              filter="button"
              :prevent-on-filter="false"
              class="min-h-28 rounded-b-lg border border-t-0 border-border/60 bg-muted/30 p-2"
              @start="dragging = true"
              @end="onDragEnd"
              @change="onDrop(col, $event)"
            >
              <template #item="{ element: el }">
                <div
                  class="mb-2.5 rounded-lg border-l-4 bg-card px-3 py-2.5 text-card-foreground shadow"
                  :class="statusBorder[el.item.station_status]"
                >
                  <div class="flex justify-between gap-2 text-xs">
                    <strong>{{ el.order.order_number }}</strong>
                    <span class="muted">
                      {{ el.order.table ? `Meja ${el.order.table.table_number}` : el.order.walk_in_name || 'Take away' }}
                    </span>
                  </div>

                  <!-- Jam & tanggal pemesanan + lama berjalan -->
                  <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span class="muted">📅 {{ dayLabel(el.order.created_at) }} · 🕐 {{ clock(el.order.created_at) }}</span>
                    <span class="rounded px-1.5 py-0.5 font-bold" :class="ageTone(el.order.created_at)">
                      ⏱ {{ ageLabel(el.order.created_at) }}
                    </span>
                  </div>

                  <div class="mt-1.5 mb-0.5 font-bold">{{ el.item.quantity }}× {{ el.item.product_name_snapshot }}</div>
                  <div v-if="el.item.variants?.length" class="m-0 text-xs text-muted-foreground">
                    {{ el.item.variants.map((v) => v.variant_name_snapshot).join(', ') }}
                  </div>
                  <div v-if="el.item.addons?.length" class="m-0 text-xs text-muted-foreground">
                    {{ el.item.addons.map((a) => `${a.addon_name_snapshot} ×${a.quantity}`).join(', ') }}
                  </div>
                  <div v-if="el.item.participant_name" class="m-0 text-xs text-muted-foreground">👤 {{ el.item.participant_name }}</div>
                  <div v-if="el.item.notes" class="m-0 text-xs text-muted-foreground">📝 {{ el.item.notes }}</div>
                  <div class="mt-1 text-[11px] font-semibold text-muted-foreground">⏱ {{ itemStatusAge(el.item) }}</div>

                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      v-if="el.item.station_status === 'pending'"
                      class="btn-dark btn-sm"
                      @click="advance(el.item, 'preparing')"
                    >
                      Mulai
                    </button>
                    <button
                      v-if="el.item.station_status === 'preparing'"
                      class="btn-primary btn-sm"
                      @click="advance(el.item, 'ready')"
                    >
                      Siap ✓
                    </button>
                    <template v-if="el.item.station_status === 'ready'">
                      <span class="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
                        READY
                      </span>
                      <button class="btn-dark btn-sm" @click="advance(el.item, 'completed')">
                        Sajikan ✓
                      </button>
                    </template>
                    <button
                      v-if="canVoid(el.order)"
                      class="btn-ghost btn-sm ml-auto text-destructive"
                      @click="voidOrder = el.order"
                    >
                      Batalkan Nota
                    </button>
                    <span v-else class="ml-auto self-center text-[11px] text-muted-foreground">
                      Tidak bisa dibatalkan — ada menu yang sudah matang
                    </span>
                  </div>
                </div>
              </template>

              <template #footer>
                <div
                  v-if="!col.cards.length"
                  class="py-6 text-center text-xs text-muted-foreground"
                >
                  —
                </div>
              </template>
            </draggable>
          </div>
        </div>
      </template>
    </template>

    <!-- ================= RIWAYAT KDS ================= -->
    <template v-else>
      <div v-if="!history.length" class="card muted py-10 text-center">Belum ada pesanan selesai. 🎉</div>

      <div class="grid gap-2.5">
        <div v-for="o in history" :key="o.id" class="card p-3">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <strong :class="{ 'line-through opacity-60': o.kitchen_status === 'cancelled' }">
              {{ o.order_number }}
            </strong>
            <span class="muted">
              {{ o.table ? `Meja ${o.table.table_number}` : o.walk_in_name || 'Take away' }}
            </span>
            <span class="muted text-xs">📅 {{ dayLabel(o.created_at) }} · 🕐 {{ clock(o.created_at) }}</span>
            <span
              class="ml-auto rounded px-2 py-0.5 text-xs font-bold"
              :class="
                o.kitchen_status === 'cancelled'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-emerald-100 text-emerald-800'
              "
            >
              {{ o.kitchen_status === 'cancelled' ? 'Dibatalkan' : 'Selesai' }}
            </span>
          </div>

          <ul class="m-0 mt-2 grid list-none gap-1 border-t border-border/60 p-0 pt-2 text-xs">
            <li v-for="it in o.items" :key="it.id" class="flex justify-between gap-2">
              <span :class="{ 'line-through opacity-60': it.station_status === 'cancelled' }">
                {{ it.quantity }}× {{ it.product_name_snapshot }}
              </span>
              <span class="muted whitespace-nowrap">
                {{ histLabel[it.station_status] ?? it.station_status }}
                <template v-if="it.station_status !== 'pending'"> · {{ clock(it.updated_at) }}</template>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>

    <VoidOrderModal :order="voidOrder" @close="voidOrder = null" @confirmed="onVoided" />
  </div>
</template>
