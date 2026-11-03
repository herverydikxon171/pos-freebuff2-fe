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
const sharedOrder = ref(null)
const categories = ref([])
const activeCategory = ref(null)
const globalName = ref('')
const busy = ref(false)
const toast = ref(null)
const configProduct = ref(null)
const config = ref({ variants: {}, addons: {}, qty: 1, notes: '' })
let timer

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

const products = computed(
  () => categories.value.find((c) => c.id === activeCategory.value)?.products ?? [],
)

// Status dapur (di-update KDS; polling 10 detik sudah ada di halaman ini).
const kitchenTone = computed(() => {
  const map = {
    pending: { icon: '⏳', label: 'Pesanan diterima', cls: 'bg-muted text-muted-foreground' },
    preparing: { icon: '🔥', label: 'Sedang dimasak', cls: 'bg-amber-100 text-amber-800' },
    ready: { icon: '✅', label: 'Siap disajikan', cls: 'bg-emerald-100 text-emerald-800' },
    completed: { icon: '✅', label: 'Selesai', cls: 'bg-emerald-100 text-emerald-800' },
    cancelled: { icon: '✖️', label: 'Dibatalkan', cls: 'bg-destructive/10 text-destructive' },
  }
  return map[sharedOrder.value?.kitchen_status] ?? null
})

const chosenAddons = computed(() => Object.keys(config.value.addons).map(Number))

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3500)
}

// Buka halaman keranjang (terpisah dari menu).
function goCart() {
  router.push({ name: 'selforder-cart', params: { code: route.params.code } })
}

async function load() {
  try {
    const { data } = await api.get(`/api/qr/${route.params.code}`)
    // Sesi ditutup (mis. nota baru saja lunas) → halaman "sesi ditutup".
    if (data.closed) {
      closed.value = true
      return
    }
    session.value = data.session
    table.value = data.table
    sharedOrder.value = data.order
    categories.value = data.categories
    if (activeCategory.value === null) activeCategory.value = categories.value[0]?.id ?? null
  } catch (e) {
    if (e.response?.status === 404) closed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  // Semua HP dalam sesi yang sama saling menyusul (gabung 1 nota).
  timer = setInterval(load, 10000)
})
onUnmounted(() => clearInterval(timer))

function groupNames(p) {
  return [...new Set(p.variants.map((v) => v.group_name))]
}

function openConfig(p) {
  const variants = {}
  for (const g of groupNames(p)) {
    variants[g] = p.variants.find((v) => v.group_name === g)?.id ?? null
  }
  config.value = { variants, addons: {}, qty: 1, notes: '' }
  configProduct.value = p
}

function toggleAddon(id) {
  const addons = config.value.addons
  if (addons[id]) delete addons[id]
  else addons[id] = 1
}

function variantExtra() {
  const p = configProduct.value
  if (!p) return 0
  return Object.values(config.value.variants).reduce((s, id) => {
    const v = p.variants.find((x) => x.id === id)
    return s + (v ? Number(v.extra_price) : 0)
  }, 0)
}

function addonTotal() {
  const p = configProduct.value
  if (!p) return 0
  return Object.entries(config.value.addons).reduce((s, [id, qty]) => {
    const a = p.addons.find((x) => x.id === Number(id))
    return s + (a ? Number(a.price) * qty : 0)
  }, 0)
}

async function addToCart() {
  if (busy.value) return
  busy.value = true
  try {
    await api.post(`/api/qr/${route.params.code}/items`, {
      items: [
        {
          product_id: configProduct.value.id,
          quantity: config.value.qty,
          variants: Object.values(config.value.variants).filter(Boolean),
          addons: Object.entries(config.value.addons).map(([addon_id, quantity]) => ({
            addon_id: Number(addon_id),
            quantity,
          })),
          participant_name: globalName.value.trim() || undefined,
          notes: config.value.notes.trim() || undefined,
        },
      ],
    })
    configProduct.value = null
    showToast('Ditambahkan ke keranjang bersama ✓')
    await load()
  } catch (e) {
    showToast(e.response?.data?.message || 'Gagal menambah pesanan.', true)
  } finally {
    busy.value = false
  }
}
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
      <div class="card mb-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h1 class="m-0 text-lg font-bold">🍜 Pesan Bersama — Meja {{ table?.table_number }}</h1>
            <div class="muted text-xs">
              Pesananmu digabung ke satu nota meja · kode sesi {{ session?.session_code }}
            </div>
          </div>
          <span v-if="sharedOrder" class="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {{ sharedOrder.items.length }} item
          </span>
        </div>
        <div
          v-if="kitchenTone"
          class="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          :class="kitchenTone.cls"
        >
          <span>{{ kitchenTone.icon }}</span> {{ kitchenTone.label }}
        </div>
        <label class="mt-2.5 grid gap-1 text-xs text-muted-foreground">
          Nama kamu (ditempel di nota dapur)
          <input v-model="globalName" placeholder="mis: Rina" maxlength="100" />
        </label>
      </div>

      <div class="mb-3 flex flex-wrap gap-2">
        <button
          v-for="c in categories"
          :key="c.id"
          :class="
            c.id === activeCategory
              ? 'rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm'
              : 'rounded-full bg-card px-4 py-2 text-sm text-card-foreground shadow-sm hover:bg-muted'
          "
          @click="activeCategory = c.id"
        >
          {{ c.name }}
        </button>
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
        <button
          v-for="p in products"
          :key="p.id"
          class="group flex flex-col gap-1.5 overflow-hidden rounded-xl bg-card p-0 text-left text-card-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          @click="openConfig(p)"
        >
          <span class="block aspect-[4/3] w-full overflow-hidden bg-muted">
            <img
              v-if="p.image_url"
              :src="p.image_url"
              :alt="p.name"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          </span>
          <span class="px-3.5 pt-0.5 font-semibold">{{ p.name }}</span>
          <span class="rp px-3.5 pb-3.5 font-bold text-primary">{{ rp(p.base_price) }}</span>
        </button>
      </div>

      <!-- Keranjang digabungkan ke halaman terpisah; dari sini fokus memilih menu. -->

      <!-- Konfigurasi item -->
      <div v-if="configProduct" class="modal-backdrop" @click.self="configProduct = null">
        <div class="modal">
          <!-- Preview produk: topping tetap DI ATAS foto utama, tapi tersusun ke samping (tidak saling menimpa) -->
          <div class="relative mx-auto mb-3 aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted">
            <img
              v-if="configProduct.image_url"
              :key="configProduct.id"
              :src="configProduct.image_url"
              :alt="configProduct.name"
              class="h-full w-full object-cover"
            />
            <TransitionGroup
              name="topping-pop"
              tag="div"
              class="pointer-events-none absolute inset-0 flex items-end justify-end gap-2 p-2"
            >
              <img
                v-for="id in chosenAddons"
                :key="id"
                :src="configProduct.addons.find((x) => x.id === id)?.image_url"
                :alt="configProduct.addons.find((x) => x.id === id)?.name"
                class="h-12 w-12 shrink-0 rounded-full border-2 border-white bg-card object-cover shadow-lg"
              />
            </TransitionGroup>
          </div>

          <h3 class="mb-2 mt-0 text-lg font-bold">
            {{ configProduct.name }}
            <span class="muted rp font-normal">{{ rp(configProduct.base_price) }}</span>
          </h3>

          <div v-for="g in groupNames(configProduct)" :key="g" class="my-2.5">
            <div class="mb-1.5 text-xs font-semibold text-muted-foreground">{{ g }}</div>
            <label
              v-for="v in configProduct.variants.filter((x) => x.group_name === g)"
              :key="v.id"
              class="mb-1.5 mr-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary"
            >
              <input v-model="config.variants[g]" type="radio" :name="'g-' + g" :value="v.id" />
              {{ v.name }}<span v-if="Number(v.extra_price)"> +{{ rp(v.extra_price) }}</span>
            </label>
          </div>

          <div v-if="configProduct.addons.length" class="my-2.5">
            <div class="mb-1.5 text-xs font-semibold text-muted-foreground">Topping</div>
            <label
              v-for="a in configProduct.addons"
              :key="a.id"
              class="mb-1.5 mr-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition"
              :class="config.addons[a.id] ? 'border-primary bg-primary/10' : 'border-border hover:border-primary'"
            >
              <input type="checkbox" :checked="config.addons[a.id]" class="hidden" @change="toggleAddon(a.id)" />
              <img
                v-if="a.image_url"
                :src="a.image_url"
                :alt="a.name"
                class="h-6 w-6 rounded-full object-cover"
                :class="config.addons[a.id] ? 'ring-2 ring-primary' : ''"
              />
              {{ a.name }} +{{ rp(a.price) }}
            </label>
          </div>

          <label class="mt-2 grid w-32 gap-1 text-xs text-muted-foreground">
            Jumlah
            <input v-model.number="config.qty" type="number" min="1" max="99" />
          </label>
          <label class="mt-2 grid gap-1 text-xs text-muted-foreground">
            Catatan
            <input v-model="config.notes" placeholder="mis: tanpa bawang" />
          </label>

          <div class="mt-4 flex items-center justify-end gap-2.5">
            <span class="rp mr-auto text-lg font-bold">
              {{ rp((Number(configProduct.base_price) + variantExtra()) * config.qty + addonTotal()) }}
            </span>
            <button class="btn-ghost" @click="configProduct = null">Batal</button>
            <button class="btn-primary" :disabled="busy" @click="addToCart">
              {{ busy ? 'Menambah…' : 'Tambah ke Nota Meja' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Bar keranjang bawah (mobile-first): total selalu terlihat; buka halaman keranjang terpisah. -->
    <div
      v-if="sharedOrder"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 shadow-lg backdrop-blur md:hidden"
    >
      <div class="mx-auto flex max-w-3xl items-center gap-3">
        <span class="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl text-primary">
          🛒
          <span
            v-if="sharedOrder.items.length"
            class="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground"
          >
            {{ sharedOrder.items.length }}
          </span>
        </span>
        <div class="min-w-0 flex-1 text-left leading-tight">
          <div class="text-xs text-muted-foreground">Keranjang meja</div>
          <div class="rp truncate text-base font-bold">{{ rp(sharedOrder.total_amount) }}</div>
        </div>
        <button
          class="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95"
          @click="goCart"
        >
          Lihat Keranjang <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
