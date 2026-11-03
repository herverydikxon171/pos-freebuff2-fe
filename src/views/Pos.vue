<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import QRCode from 'qrcode'
import api from '../api.js'
import { useCartStore } from '../stores/cart.js'

const router = useRouter()

const categories = ref([])
const meta = ref(null)
const activeCategory = ref(null)
const configProduct = ref(null)
const config = ref({ variants: {}, addons: {}, qty: 1, participant_name: '', notes: '' })
const busy = ref(false)

// Keranjang & konteks nota disimpan di store Pinia supaya selamat saat kasir
// pindah ke halaman Bayar (POS unmount saat rute berganti) lalu kembali.
const { cart, opts, phone, member, redeemPoints } = storeToRefs(useCartStore())
const toast = ref(null)

// Nota (cart) mobile: panel bawah yang menaik dari bawah layar.
const cartOpen = ref(false)

// Sesi QR pay-later per meja.
const qrSession = ref(null)
const qrImage = ref('')
const busyQr = ref(false)

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

const products = computed(() => categories.value.find((c) => c.id === activeCategory.value)?.products ?? [])
const settings = computed(() => meta.value?.store?.settings ?? { tax_percentage: 0, service_charge_percentage: 0 })

const subtotal = computed(() => cart.value.reduce((s, l) => s + l.qty * l.unit_price + l.addon_total, 0))
// Sama dengan backend: pajak & service dihitung setelah diskon poin.
const estDiscount = computed(() => Math.min(Number(redeemPoints.value) || 0, maxRedeem.value) * 100)
const estTax = computed(
  () => Math.round(((subtotal.value - estDiscount.value) * Number(settings.value.tax_percentage)) / 100),
)
const estService = computed(
  () => Math.round(((subtotal.value - estDiscount.value) * Number(settings.value.service_charge_percentage)) / 100),
)
const estTotal = computed(() => subtotal.value - estDiscount.value + estTax.value + estService.value)

// Ringkasan ringkas untuk bar bawah mobile.
const cartCount = computed(() => cart.value.reduce((s, l) => s + l.qty, 0))

// Batas tukar poin sama dengan backend: min(poin member, floor(subtotal/100)).
const maxRedeem = computed(() =>
  member.value
    ? Math.min(Number(member.value.loyalty_points) || 0, Math.floor(subtotal.value / 100))
    : 0,
)

const qrLink = computed(() =>
  qrSession.value ? `${window.location.origin}/qr/${qrSession.value.session_code}` : '',
)

// Cetak stiker QR meja — pola sama dengan cetak bill: sembunyikan UI, tampilkan area cetak.
function printQr() {
  document.body.classList.add('printing-qr')
  const cleanup = () => {
    document.body.classList.remove('printing-qr')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(() => window.print(), 60)
  setTimeout(cleanup, 2000)
}

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3500)
}

// Buka/tutup panel nota mobile (dipakai bar bawah).
function toggleCart() {
  cartOpen.value = !cartOpen.value
}

function showError(e) {
  const data = e.response?.data
  const msg = data?.errors ? Object.values(data.errors)[0][0] : data?.message
  showToast(msg || 'Terjadi kesalahan.', true)
}

async function load() {
  try {
    const [c, m] = await Promise.all([api.get('/api/catalog'), api.get('/api/meta')])
    categories.value = c.data.categories
    meta.value = m.data
    activeCategory.value = categories.value[0]?.id ?? null
    opts.value.channel_id = m.data.channels.find((ch) => ch.name === 'POS Kasir')?.id ?? m.data.channels[0]?.id ?? ''
    if (!opts.value.table_id && m.data.tables.length) opts.value.table_id = m.data.tables[0].id
  } catch (e) {
    showError(e)
  }
}

onMounted(load)

function groupNames(p) {
  return [...new Set(p.variants.map((v) => v.group_name))]
}

function openConfig(p) {
  const variants = {}
  for (const g of groupNames(p)) {
    variants[g] = p.variants.find((v) => v.group_name === g)?.id ?? null
  }
  config.value = { variants, addons: {}, qty: 1, participant_name: '', notes: '' }
  configProduct.value = p
}

const chosenAddons = computed(() =>
  Object.keys(config.value.addons).map(Number),
)

function toggleAddon(id) {
  const addons = config.value.addons
  if (addons[id]) delete addons[id]
  else addons[id] = 1
}

function configVariantExtra() {
  const p = configProduct.value
  if (!p) return 0
  return Object.values(config.value.variants).reduce((s, id) => {
    const v = p.variants.find((x) => x.id === id)
    return s + (v ? Number(v.extra_price) : 0)
  }, 0)
}

function configAddonTotal() {
  const p = configProduct.value
  if (!p) return 0
  return Object.entries(config.value.addons).reduce((s, [id, qty]) => {
    const a = p.addons.find((x) => x.id === Number(id))
    return s + (a ? Number(a.price) * qty : 0)
  }, 0)
}

function addToCart() {
  const p = configProduct.value
  const variantIds = Object.values(config.value.variants).filter(Boolean)
  const variantNames = variantIds.map((id) => p.variants.find((v) => v.id === id)?.name).filter(Boolean)
  const addonRows = Object.entries(config.value.addons).map(([id, quantity]) => ({
    addon_id: Number(id),
    quantity,
  }))
  const addonNames = addonRows
    .map((r) => {
      const a = p.addons.find((x) => x.id === r.addon_id)
      return a ? `${a.name} ×${r.quantity}` : ''
    })
    .filter(Boolean)

  cart.value.push({
    product_id: p.id,
    name: p.name,
    qty: config.value.qty,
    unit_price: Number(p.base_price) + configVariantExtra(),
    addon_total: configAddonTotal(),
    variant_ids: variantIds,
    addon_rows: addonRows,
    label: [...variantNames, ...addonNames].join(' · '),
    participant_name: config.value.participant_name,
    notes: config.value.notes,
  })
  configProduct.value = null
}

function removeLine(i) {
  cart.value.splice(i, 1)
}
function inc(i) {
  cart.value[i].qty += 1
}
function dec(i) {
  if (cart.value[i].qty > 1) cart.value[i].qty -= 1
  else removeLine(i)
}

async function createOrder() {
  if (!cart.value.length || busy.value) return
  busy.value = true
  try {
    const { data } = await api.post('/api/orders', {
      store_id: meta.value.store_id,
      order_type: opts.value.order_type,
      payment_timing: opts.value.payment_timing,
      table_id: opts.value.order_type === 'dine_in' ? opts.value.table_id || undefined : undefined,
      channel_id: opts.value.channel_id || undefined,
      customer_id: member.value?.id || undefined,
      redeem_points: redeemPoints.value > 0 ? redeemPoints.value : undefined,
      items: cart.value.map((l) => ({
        product_id: l.product_id,
        quantity: l.qty,
        variants: l.variant_ids,
        addons: l.addon_rows,
        participant_name: l.participant_name || undefined,
        notes: l.notes || undefined,
      })),
    })
    cart.value = []
    redeemPoints.value = 0
    cartOpen.value = false // tutup sheet mobile — halaman bayar/modal berikutnya harus terlihat
    if (member.value) lookupCustomer() // segarkan saldo poin setelah earn/redeem
    if (opts.value.payment_timing === 'pay_first') {
      // Pindah halaman: pembayaran dibuka sebagai halaman baru (bukan modal).
      router.push({ name: 'pay', params: { id: data.id } })
    } else {
      showToast(`Nota ${data.order_number} dibuat — bayar nanti.`)
    }
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}

// --- Member & loyalty ---
async function lookupCustomer() {
  const q = phone.value.trim()
  if (!q) {
    member.value = null
    return
  }
  try {
    const { data } = await api.get('/api/customers/find', { params: { phone: q } })
    member.value = data.customer
  } catch {
    member.value = null
  }
}

async function registerMember() {
  try {
    const { data } = await api.post('/api/customers', { phone_number: phone.value.trim() })
    member.value = data.customer
    showToast('Pelanggan terdaftar sebagai member ✓')
  } catch (e) {
    showError(e)
  }
}

function clearMember() {
  member.value = null
  phone.value = ''
  redeemPoints.value = 0
}

// --- Sesi QR pay-later ---
async function openQrSession() {
  if (busyQr.value || !opts.value.table_id) return
  busyQr.value = true
  try {
    const { data } = await api.post(`/api/tables/${opts.value.table_id}/session`, {})
    qrSession.value = data.session
    // Gambar QR siap-pindai: kamera HP langsung membuka halaman pesan mandiri meja ini.
    qrImage.value = await QRCode.toDataURL(`${window.location.origin}/qr/${data.session.session_code}`, {
      margin: 1,
      width: 360,
    })
  } catch (e) {
    showError(e)
  } finally {
    busyQr.value = false
  }
}

async function copyQrLink() {
  try {
    await navigator.clipboard.writeText(qrLink.value)
    showToast('Link QR disalin ✓')
  } catch {
    showToast('Gagal menyalin — salin manual dari layar.', true)
  }
}

</script>

<template>
  <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">
    <section class="pb-20 lg:pb-0">
      <!-- Header ringkas mobile: akses Riwayat walau panel nota belum terbuka. -->
      <div class="mb-3 flex items-center justify-between gap-2 lg:hidden">
        <h1 class="m-0 text-lg font-bold">Kasir</h1>
        <button class="btn-ghost btn-sm" @click="router.push({ name: 'history' })">🧾 Riwayat</button>
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

      <div class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5">
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
    </section>

    <!-- Panel nota: sticky card di desktop, bottom-sheet modern di mobile. -->
    <div
      v-if="cartOpen"
      class="sheet-backdrop lg:hidden"
      @click.self="cartOpen = false"
    >
      <div class="sheet">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 class="m-0 text-base font-bold">Nota · {{ cartCount }} item</h3>
          <button class="btn-ghost btn-sm" aria-label="Tutup nota" @click="cartOpen = false">✕</button>
        </div>
        <div class="flex-1 overflow-auto px-4 py-3">
          <div v-if="!cart.length" class="muted py-8 text-center">Keranjang kosong — klik menu untuk mulai.</div>
          <ul v-else class="m-0 grid list-none gap-2.5 p-0">
            <li v-for="(l, i) in cart" :key="i" class="flex items-start gap-3 rounded-xl bg-muted/60 p-2.5">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                {{ l.qty }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex justify-between gap-2">
                  <strong class="truncate">{{ l.name }}</strong>
                  <span class="rp shrink-0 font-semibold">{{ rp(l.qty * l.unit_price + l.addon_total) }}</span>
                </div>
                <div v-if="l.label" class="muted truncate text-xs">{{ l.label }}</div>
                <div v-if="l.participant_name" class="muted text-xs">Peserta: {{ l.participant_name }}</div>
                <div class="mt-1.5 flex items-center gap-1.5">
                  <button class="grid h-7 w-7 place-items-center rounded-lg bg-card text-foreground shadow-sm hover:bg-border" @click="dec(i)">−</button>
                  <span class="w-6 text-center text-sm font-semibold">{{ l.qty }}</span>
                  <button class="grid h-7 w-7 place-items-center rounded-lg bg-card text-foreground shadow-sm hover:bg-border" @click="inc(i)">+</button>
                  <button class="ml-auto rounded-lg bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20" @click="removeLine(i)">
                    Hapus
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </div>
        <div v-if="cart.length" class="border-t border-border px-4 py-3">
          <!-- Waktu Bayar ikut di sheet: di mobile aside tersembunyi, kasir harus tetap bisa pilih Bayar Dulu. -->
          <label class="mb-2.5 grid gap-1 text-xs text-muted-foreground">
            Waktu Bayar
            <select v-model="opts.payment_timing">
              <option value="pay_later">Bayar Nanti (Open Bill)</option>
              <option value="pay_first">Bayar Dulu</option>
            </select>
          </label>
          <div class="flex justify-between text-base font-bold">
            <span>Total</span>
            <span class="rp">{{ rp(estTotal) }}</span>
          </div>
          <button class="btn-primary mt-2.5 w-full" :disabled="busy" @click="createOrder">
            {{ busy ? 'Memproses…' : opts.payment_timing === 'pay_first' ? 'Buat Nota & Bayar' : 'Buat Nota (Bayar Nanti)' }}
          </button>
        </div>
      </div>
    </div>

    <aside class="card sticky top-4 hidden lg:block">
      <div class="mb-2.5 flex items-center justify-between gap-2">
        <h3 class="m-0 text-base font-bold">Nota</h3>
        <button class="btn-ghost btn-sm" @click="router.push({ name: 'history' })">🧾 Riwayat</button>
      </div>

      <div class="mb-2.5 grid gap-2">
        <label class="grid gap-1 text-xs text-muted-foreground">
          Tipe
          <select v-model="opts.order_type">
            <option value="dine_in">Dine In</option>
            <option value="take_away">Take Away</option>
            <option value="delivery">Delivery</option>
          </select>
        </label>
        <label v-if="opts.order_type === 'dine_in'" class="grid gap-1 text-xs text-muted-foreground">
          Meja
          <select v-model="opts.table_id">
            <option v-for="t in meta?.tables ?? []" :key="t.id" :value="t.id">
              Meja {{ t.table_number }} ({{ t.area }})
            </option>
          </select>
        </label>
        <button
          v-if="opts.order_type === 'dine_in'"
          class="btn-ghost btn-sm"
          :disabled="busyQr || !opts.table_id"
          @click="openQrSession"
        >
          {{ busyQr ? 'Membuka…' : '🔗 Buka Sesi QR (Pesan Bersama)' }}
        </button>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Waktu Bayar
          <select v-model="opts.payment_timing">
            <option value="pay_later">Bayar Nanti (Open Bill)</option>
            <option value="pay_first">Bayar Dulu</option>
          </select>
        </label>

        <!-- Member & loyalty (opsional) -->
        <label class="grid gap-1 text-xs text-muted-foreground">
          No. HP Member (opsional)
          <input
            v-model="phone"
            type="tel"
            maxlength="30"
            placeholder="08xx — cari poin member"
            @change="lookupCustomer"
          />
        </label>
        <div v-if="member" class="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5 text-xs">
          <span>👤 <b>{{ member.name || 'Member' }}</b> · {{ member.loyalty_points }} poin</span>
          <button class="text-destructive" title="Lepas member" @click="clearMember">✕</button>
        </div>
        <button v-else-if="phone.trim()" class="btn-ghost btn-sm" @click="registerMember">
          + Daftarkan member baru
        </button>
        <div v-if="member && member.loyalty_points > 0" class="grid gap-1 text-xs">
          <label class="flex items-center justify-between text-muted-foreground">
            Tukar poin
            <input v-model.number="redeemPoints" type="number" min="0" :max="maxRedeem" class="w-24" />
          </label>
          <span class="muted">
            ≈ {{ rp((Number(redeemPoints) || 0) * 100) }} potongan · maks {{ maxRedeem }} poin
          </span>
        </div>
      </div>

      <div v-if="!cart.length" class="muted py-5 text-center">Keranjang kosong — klik menu untuk mulai.</div>

      <ul class="m-0 grid list-none gap-2.5 overflow-auto p-0 max-h-[38vh]">
        <li v-for="(l, i) in cart" :key="i" class="flex items-start gap-3 rounded-xl bg-muted/60 p-2.5">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {{ l.qty }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex justify-between gap-2">
              <strong class="truncate">{{ l.name }}</strong>
              <span class="rp shrink-0 font-semibold">{{ rp(l.qty * l.unit_price + l.addon_total) }}</span>
            </div>
            <div v-if="l.label" class="muted truncate text-xs">{{ l.label }}</div>
            <div v-if="l.participant_name" class="muted text-xs">Peserta: {{ l.participant_name }}</div>
            <div class="mt-1.5 flex items-center gap-1.5">
              <button class="grid h-7 w-7 place-items-center rounded-lg bg-card text-foreground shadow-sm hover:bg-border" @click="dec(i)">−</button>
              <span class="w-6 text-center text-sm font-semibold">{{ l.qty }}</span>
              <button class="grid h-7 w-7 place-items-center rounded-lg bg-card text-foreground shadow-sm hover:bg-border" @click="inc(i)">+</button>
              <button class="ml-auto rounded-lg bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20" @click="removeLine(i)">
                Hapus
              </button>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="cart.length" class="mt-3 grid gap-1.5 border-t border-dashed border-border pt-2.5 text-sm">
        <div class="flex justify-between">
          <span>Subtotal</span>
          <span class="rp">{{ rp(subtotal) }}</span>
        </div>
        <div v-if="estDiscount" class="flex justify-between text-emerald-700">
          <span>Diskon poin ({{ redeemPoints }} poin)</span>
          <span class="rp">−{{ rp(estDiscount) }}</span>
        </div>
        <div class="flex justify-between">
          <span>{{ settings.tax_name ?? 'Pajak' }} ({{ settings.tax_percentage }}%)</span>
          <span class="rp">{{ rp(estTax) }}</span>
        </div>
        <div class="flex justify-between">
          <span>Service ({{ settings.service_charge_percentage }}%)</span>
          <span class="rp">{{ rp(estService) }}</span>
        </div>
        <div class="flex justify-between text-base font-bold">
          <span>Total</span>
          <span class="rp">{{ rp(estTotal) }}</span>
        </div>
        <button class="btn-primary mt-1.5" :disabled="busy" @click="createOrder">
          {{ busy ? 'Memproses…' : opts.payment_timing === 'pay_first' ? 'Buat Nota & Bayar' : 'Buat Nota (Bayar Nanti)' }}
        </button>
      </div>
    </aside>

    <!-- Bar keranjang bawah (mobile): selalu terlihat, buka panel nota. -->
    <button
      v-if="cartCount"
      class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-card/95 p-3 text-left shadow-lg backdrop-blur lg:hidden"
      @click="toggleCart"
    >
      <span class="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl text-primary">
        🛒
        <span class="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
          {{ cartCount }}
        </span>
      </span>
      <span class="min-w-0 flex-1 leading-tight">
        <span class="block text-xs text-muted-foreground">Nota · {{ cartCount }} item</span>
        <span class="rp block truncate text-base font-bold">{{ rp(estTotal) }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
        Lihat Nota <span aria-hidden="true">→</span>
      </span>
    </button>

    <!-- Konfigurasi produk: varian, topping, jumlah, peserta -->
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
          {{ configProduct.name }} <span class="muted rp font-normal">{{ rp(configProduct.base_price) }}</span>
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

        <div class="mt-2 flex gap-3">
          <label class="grid flex-1 gap-1 text-xs text-muted-foreground">
            Jumlah
            <input v-model.number="config.qty" type="number" min="1" max="99" />
          </label>
          <label class="grid flex-1 gap-1 text-xs text-muted-foreground">
            Nama Peserta
            <input v-model="config.participant_name" placeholder="opsional" />
          </label>
        </div>
        <label class="mt-2 grid gap-1 text-xs text-muted-foreground">
          Catatan
          <input v-model="config.notes" placeholder="mis: tanpa bawang" />
        </label>

        <div class="mt-4 flex items-center justify-end gap-2.5">
          <span class="rp mr-auto text-lg font-bold">
            {{ rp((Number(configProduct.base_price) + configVariantExtra()) * config.qty + configAddonTotal()) }}
          </span>
          <button class="btn-ghost" @click="configProduct = null">Batal</button>
          <button class="btn-primary" @click="addToCart">Tambah ke Keranjang</button>
        </div>
      </div>
    </div>

    <!-- Sesi QR pay-later -->
    <div v-if="qrSession" class="modal-backdrop" @click.self="qrSession = null">
      <div class="modal max-w-sm text-center">
        <h3 class="mb-1 mt-0 text-lg font-bold">
          Sesi QR — Meja {{ meta?.tables?.find((t) => t.id === opts.table_id)?.table_number }}
        </h3>
        <p class="muted mb-3 text-sm">
          Bagikan link ini — semua yang scan pesan ke <b>1 nota meja yang sama</b> (bayar nanti di
          kasir).
        </p>
        <img
          v-if="qrImage"
          :src="qrImage"
          alt="QR pesan bersama"
          class="mx-auto my-3 w-[min(300px,70vw)] rounded-xl border border-border bg-white p-2"
        />
        <div class="rounded-lg bg-muted px-3 py-2 font-mono text-lg font-bold tracking-widest">
          {{ qrSession.session_code }}
        </div>
        <div class="mt-2 break-all text-xs text-muted-foreground">{{ qrLink }}</div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-ghost btn-sm" @click="printQr">🖨 Cetak Stiker</button>
          <button class="btn-ghost btn-sm" @click="copyQrLink">📋 Salin Link</button>
          <button class="btn-dark btn-sm" @click="qrSession = null">Selesai</button>
        </div>
      </div>
    </div>

    <!-- Area cetak stiker QR: tersembunyi di layar, tampil saat body.printing-qr + print(). -->
    <div v-if="qrSession && qrImage" class="print-qr-area">
      <div style="font-size: 22px; font-weight: 700">
        Meja {{ meta?.tables?.find((t) => t.id === opts.table_id)?.table_number }}
      </div>
      <img :src="qrImage" alt="" style="width: 55mm; margin: 10px auto" />
      <div style="font-family: monospace; font-size: 16px; letter-spacing: 3px; font-weight: 700">
        {{ qrSession.session_code }}
      </div>
      <div style="font-size: 11px; word-break: break-all; margin-top: 4px">{{ qrLink }}</div>
      <div style="font-size: 12px; margin-top: 6px">Scan untuk pesan mandiri 🍜</div>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
