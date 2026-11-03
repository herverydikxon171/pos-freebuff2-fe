<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api.js'
import { moneyFmt, onMoney } from '../money.js'

// Halaman form produk (baru/edit) — pengganti modal di Kelola Menu.
const route = useRoute()
const router = useRouter()

const data = ref({ products: [], categories: [], stations: [], addons: [], ingredients: [] })
const form = ref(null)
const loading = ref(true)
const toast = ref(null)
const busy = ref(false)
const uploading = ref(false)

const isEdit = computed(() => !!route.params.id)
const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3500)
}

function showError(e) {
  const d = e.response?.data
  const msg = d?.errors ? Object.values(d.errors)[0][0] : d?.message
  showToast(msg || 'Terjadi kesalahan.', true)
}

function blankForm() {
  return {
    id: null,
    name: '',
    category_id: data.value.categories[0]?.id ?? '',
    kitchen_station_id: data.value.stations[0]?.id ?? '',
    base_price: 0,
    description: '',
    image_url: '',
    is_available: true,
    variants: [],
    addons: [],
    ingredients: [],
    portionGroup: '',
  }
}

function buildForm(p) {
  const f = {
    id: p.id,
    name: p.name,
    category_id: p.category_id,
    kitchen_station_id: p.kitchen_station_id ?? '',
    base_price: Number(p.base_price),
    description: p.description ?? '',
    image_url: p.image_url ?? '',
    is_available: !!p.is_available,
    variants: p.variants.map((v) => ({
      id: v.id,
      group_name: v.group_name,
      name: v.name,
      extra_price: Number(v.extra_price),
      is_available: !!v.is_available,
    })),
    addons: p.addons.map((a) => a.id),
    ingredients: (p.ingredients ?? []).map((i) => ({
      ingredient_id: i.id,
      quantity_needed: Number(i.pivot?.quantity_needed ?? 0),
      vq: {},
    })),
    portionGroup: '',
  }
  // Qty per porsi: {ingredient_id: {variant_id: qty}} dari variant_ingredients.
  const viMap = {}
  for (const vi of p.variant_ingredients ?? []) {
    ;(viMap[vi.ingredient_id] ??= {})[vi.variant_id] = Number(vi.quantity_needed)
  }
  for (const row of f.ingredients) {
    row.vq = viMap[row.ingredient_id] ?? {}
  }
  // Pilih otomatis grup yang mirip porsi (Ukuran/Porsi) kalau ada.
  const groups = [...new Set(f.variants.map((v) => v.group_name).filter(Boolean))]
  f.portionGroup = groups.find((g) => /ukuran|porsi/i.test(g)) ?? ''
  return f
}

async function load() {
  try {
    const { data: d } = await api.get('/api/admin/menu')
    data.value = d
    if (route.params.id) {
      const p = d.products.find((x) => x.id === Number(route.params.id))
      if (!p) {
        router.replace({ name: 'admin' })
        return
      }
      form.value = buildForm(p)
    } else {
      form.value = blankForm()
    }
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Unggah saat file dipilih; preview langsung berganti setelah server balik URL.
async function onPickImage(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('image', file)
    const { data: d } = await api.post('/api/admin/images', fd)
    form.value.image_url = d.url
    showToast('Gambar terunggah.')
  } catch (err) {
    showError(err)
  } finally {
    uploading.value = false
    e.target.value = '' // reset supaya file yang sama bisa dipilih ulang
  }
}

// --- Aksi baris form ---
function addVariant() {
  form.value.variants.push({ group_name: '', name: '', extra_price: 0, is_available: true })
}
function delVariantRow(i) {
  form.value.variants.splice(i, 1)
}
function toggleProdAddon(id) {
  const arr = form.value.addons
  const i = arr.indexOf(id)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(id)
}
function addRecipeRow() {
  form.value.ingredients.push({ ingredient_id: data.value.ingredients[0]?.id ?? '', quantity_needed: 0, vq: {} })
}
function delRecipeRow(i) {
  form.value.ingredients.splice(i, 1)
}

// Estimasi HPP per porsi: Σ (qty bahan × harga per satuan).
const recipeHpp = computed(() => {
  if (!form.value) return 0
  return form.value.ingredients.reduce((s, r) => {
    const ing = data.value.ingredients.find((x) => x.id === r.ingredient_id)
    return s + (ing ? Number(ing.cost_per_unit) * Number(r.quantity_needed || 0) : 0)
  }, 0)
})

// Grup varian yang bisa dipakai sebagai kolom porsi (mis. "Ukuran").
const portionGroups = computed(() => [
  ...new Set((form.value?.variants ?? []).map((v) => v.group_name).filter(Boolean)),
])
const portionVariants = computed(() =>
  (form.value?.variants ?? []).filter(
    (v) => v.group_name && v.group_name === form.value?.portionGroup && v.name,
  ),
)
// Kolom grid resep: [bahan][standar][porsi…][✕]
const recipeGridStyle = computed(() => {
  const n = portionVariants.value.length
  return {
    'grid-template-columns': n
      ? `minmax(0,1fr) 92px repeat(${n}, 80px) 34px`
      : 'minmax(0,1fr) 110px 34px',
  }
})
// HPP per porsi: qty kolom porsi bila diisi, fallback ke qty standar (sama seperti saat potong stok).
const portionHpps = computed(() => {
  if (!form.value || !portionVariants.value.length) return []
  return portionVariants.value.map((v) => ({
    id: v.id,
    name: v.name,
    hpp: form.value.ingredients.reduce((s, r) => {
      const ing = data.value.ingredients.find((x) => x.id === r.ingredient_id)
      const q = r.vq?.[v.id] !== undefined && r.vq?.[v.id] !== '' ? r.vq[v.id] : r.quantity_needed
      return s + (ing ? Number(ing.cost_per_unit) * Number(q || 0) : 0)
    }, 0),
  }))
})

async function saveProd() {
  if (busy.value) return
  busy.value = true
  try {
    const f = form.value
    const payload = {
      name: f.name,
      category_id: f.category_id,
      kitchen_station_id: f.kitchen_station_id || null,
      base_price: f.base_price,
      description: f.description || null,
      image_url: f.image_url || null,
      is_available: f.is_available,
      variants: f.variants
        .filter((v) => v.group_name && v.name)
        .map((v) => ({
          id: v.id ?? null,
          group_name: v.group_name,
          name: v.name,
          extra_price: v.extra_price,
          is_available: v.is_available,
        })),
      addons: f.addons,
      ingredients: f.ingredients
        .filter((r) => r.ingredient_id)
        .map((r) => ({ ingredient_id: r.ingredient_id, quantity_needed: Number(r.quantity_needed) || 0 })),
      // Qty per porsi: hanya baris berisi angka yang dikirim (kolom kosong = ikut standar).
      variant_ingredients: f.ingredients.flatMap((r) =>
        Object.entries(r.vq ?? {})
          .filter(([, q]) => q !== '' && q != null && r.ingredient_id)
          .map(([vid, q]) => ({
            variant_id: Number(vid),
            ingredient_id: r.ingredient_id,
            quantity_needed: Number(q),
          })),
      ),
    }
    if (f.id) await api.put(`/api/admin/products/${f.id}`, payload)
    else await api.post('/api/admin/products', payload)
    router.push({ name: 'admin', query: { saved: '1' } })
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-4 flex items-center gap-3">
      <button class="btn-ghost btn-sm" @click="router.push({ name: 'admin' })">← Kembali</button>
      <h1 class="m-0 text-xl font-bold">{{ isEdit ? 'Edit Produk' : 'Produk Baru' }}</h1>
      <span class="muted hidden sm:inline">perubahan langsung terpakai di layar Kasir</span>
    </div>

    <div v-if="loading" class="muted py-8 text-center">Memuat…</div>

    <div v-else-if="form" class="grid gap-4">
      <section class="card">
        <span class="text-xs font-semibold text-muted-foreground">DASAR PRODUK</span>
        <div class="mt-2 grid grid-cols-2 gap-3">
          <label class="col-span-2 grid gap-1 text-xs text-muted-foreground">
            Nama produk
            <input v-model="form.name" placeholder="mis: Bakmie Goreng Spesial" />
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            Kategori
            <select v-model="form.category_id">
              <option v-for="c in data.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            Stasiun dapur
            <select v-model="form.kitchen_station_id">
              <option value="">— tanpa stasiun —</option>
              <option v-for="s in data.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            Harga dasar
            <input
              :value="moneyFmt(form.base_price)"
              inputmode="numeric"
              placeholder="mis: 28.000"
              @input="onMoney($event, (d) => (form.base_price = d))"
            />
          </label>
          <label class="mt-5 flex items-center gap-2 text-sm text-foreground">
            <input v-model="form.is_available" type="checkbox" /> Tersedia dijual
          </label>
          <label class="col-span-2 grid gap-1 text-xs text-muted-foreground">
            Deskripsi
            <textarea v-model="form.description" rows="2"></textarea>
          </label>
          <div class="col-span-2 grid gap-1 text-xs text-muted-foreground">
            <span>Gambar produk</span>
            <div class="flex items-center gap-3">
              <img
                v-if="form.image_url"
                :src="form.image_url"
                alt="Preview gambar produk"
                class="h-16 w-16 rounded-lg border border-border object-cover"
              />
              <span
                v-else
                class="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-border text-center text-[10px] text-muted-foreground"
              >
                tanpa gambar
              </span>
              <div class="flex flex-col items-start gap-1.5">
                <input type="file" accept="image/*" class="text-xs" :disabled="uploading" @change="onPickImage" />
                <span v-if="uploading" class="muted text-xs">Mengunggah…</span>
                <button
                  v-if="form.image_url && !uploading"
                  type="button"
                  class="btn-ghost btn-sm"
                  @click="form.image_url = ''"
                >
                  Hapus gambar
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-xs font-semibold text-muted-foreground">VARIAN</span>
            <button class="btn-sm bg-muted text-foreground hover:bg-border" @click="addVariant">+ Varian</button>
          </div>
          <div v-if="!form.variants.length" class="muted">Belum ada varian — harga jual = harga dasar.</div>
          <div
            v-for="(v, i) in form.variants"
            :key="v.id ?? 'new' + i"
            class="mb-1.5 grid grid-cols-[1fr_1fr_100px_60px_34px] items-center gap-2"
          >
            <input v-model="v.group_name" placeholder="grup: Jenis Mie" />
            <input v-model="v.name" placeholder="nama: Mie Lebar" />
            <input
              :value="moneyFmt(v.extra_price)"
              inputmode="numeric"
              placeholder="extra +"
              @input="onMoney($event, (d) => (v.extra_price = d))"
            />
            <label class="flex items-center gap-1 text-xs text-muted-foreground">
              <input v-model="v.is_available" type="checkbox" /> aktif
            </label>
            <button
              class="bg-destructive/10 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/20"
              @click="delVariantRow(i)"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="mt-4">
          <span class="text-xs font-semibold text-muted-foreground">TOPING YANG DIIZINKAN</span>
          <div class="mt-1.5 flex flex-wrap gap-2">
            <label
              v-for="a in data.addons"
              :key="a.id"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary"
            >
              <input type="checkbox" :checked="form.addons.includes(a.id)" @change="toggleProdAddon(a.id)" />
              {{ a.name }} +{{ rp(a.price) }}
            </label>
          </div>
        </div>
      </section>

      <!-- Resep / BOM: bahan per porsi yang dipotong dari stok saat nota lunas -->
      <section class="card">
        <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold text-muted-foreground">RESEP (BOM) — BAHAN PER PORSI</span>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
              Porsi per varian
              <select v-model="form.portionGroup" class="w-auto py-1 text-xs">
                <option value="">— qty seragam —</option>
                <option v-for="g in portionGroups" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <button class="btn-sm bg-muted text-foreground hover:bg-border" @click="addRecipeRow">+ Bahan</button>
          </div>
        </div>

        <!-- Label kolom porsi (mis. Kecil/Sedang/Jumbo) -->
        <div
          v-if="portionVariants.length && form.ingredients.length"
          class="mb-1 grid items-center gap-2 text-xs font-semibold text-muted-foreground"
          :style="recipeGridStyle"
        >
          <span></span>
          <span class="text-center">standar</span>
          <span v-for="v in portionVariants" :key="v.id" class="text-center">{{ v.name }}</span>
          <span></span>
        </div>

        <div v-if="!form.ingredients.length" class="muted text-sm">
          Belum ada resep — stok bahan tidak terpotong saat produk ini terjual.
        </div>
        <div
          v-for="(r, i) in form.ingredients"
          :key="i"
          class="mb-1.5 grid items-center gap-2"
          :style="recipeGridStyle"
        >
          <select v-model="r.ingredient_id">
            <option value="" disabled>pilih bahan…</option>
            <option v-for="ing in data.ingredients" :key="ing.id" :value="ing.id">
              {{ ing.name }} ({{ ing.unit }})
            </option>
          </select>
          <input v-model.number="r.quantity_needed" type="number" min="0" step="0.001" placeholder="qty" />
          <input
            v-for="v in portionVariants"
            :key="v.id"
            v-model.number="r.vq[v.id]"
            type="number"
            min="0"
            step="0.001"
            :aria-label="`${v.name} per porsi`"
            class="text-center"
          />
          <button
            class="bg-destructive/10 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/20"
            @click="delRecipeRow(i)"
          >
            ✕
          </button>
        </div>

        <div v-if="form.ingredients.length" class="mt-1 text-xs text-muted-foreground">
          <template v-if="portionVariants.length">
            Estimasi HPP / porsi:
            <span v-for="p in portionHpps" :key="p.id" class="mr-3">
              <b class="text-foreground">{{ p.name }}</b>
              <span class="rp font-semibold text-foreground">{{ rp(p.hpp) }}</span>
            </span>
          </template>
          <template v-else>
            Estimasi HPP / porsi:
            <span class="rp font-semibold text-foreground">{{ rp(recipeHpp) }}</span>
          </template>
        </div>
      </section>

      <div class="flex justify-end gap-2.5">
        <button class="btn-ghost" @click="router.push({ name: 'admin' })">Batal</button>
        <button class="btn-primary" :disabled="busy" @click="saveProd">
          {{ busy ? 'Menyimpan…' : 'Simpan Produk' }}
        </button>
      </div>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
