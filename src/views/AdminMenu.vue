<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api.js'
import { moneyFmt, onMoney } from '../money.js'

const route = useRoute()
const router = useRouter()

const tab = ref('products')
const data = ref({ products: [], categories: [], stations: [], addons: [], ingredients: [] })
const catForm = ref(null)
const addonForm = ref(null)
const toast = ref(null)
const busy = ref(false)
const uploading = ref(false)

// Unggah gambar kategori/toping — endpoint sama dengan produk.
async function pickImage(e, form) {
  const file = e.target.files?.[0]
  if (!file || !form) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('image', file)
    const { data } = await api.post('/api/admin/images', fd)
    form.image_url = data.url
    showToast('Gambar terunggah.')
  } catch (err) {
    showError(err)
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}
function clearImage(form) {
  form.image_url = ''
}

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

const tabs = [
  { id: 'products', label: 'Produk' },
  { id: 'categories', label: 'Kategori' },
  { id: 'addons', label: 'Toping' },
]

function showToast(message, isError = false) {
  toast.value = { message, isError }
  setTimeout(() => (toast.value = null), 3500)
}

function showError(e) {
  const d = e.response?.data
  const msg = d?.errors ? Object.values(d.errors)[0][0] : d?.message
  showToast(msg || 'Terjadi kesalahan.', true)
}

async function load() {
  try {
    const { data: d } = await api.get('/api/admin/menu')
    data.value = d
  } catch (e) {
    showError(e)
  }
}

onMounted(() => {
  load()
  // Kembali dari halaman form produk dengan simpan sukses → konfirmasi sekali.
  if (route.query.saved) {
    showToast('Produk tersimpan.')
    router.replace({ name: 'admin', query: {} })
  }
})

// --- Kategori ---
function newCat() {
  catForm.value = { name: '', image_url: '', sort_order: 0, is_active: true }
}
function editCat(c) {
  catForm.value = { id: c.id, name: c.name, image_url: c.image_url ?? '', sort_order: c.sort_order, is_active: !!c.is_active }
}
async function saveCat() {
  if (busy.value) return
  busy.value = true
  try {
    const f = catForm.value
    if (f.id) await api.put(`/api/admin/categories/${f.id}`, f)
    else await api.post('/api/admin/categories', f)
    catForm.value = null
    await load()
    showToast('Kategori tersimpan.')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
async function delCat(c) {
  if (!confirm(`Hapus kategori "${c.name}"?`)) return
  try {
    await api.delete(`/api/admin/categories/${c.id}`)
    await load()
    showToast('Kategori dihapus.')
  } catch (e) {
    showError(e)
  }
}

// --- Toping ---
function newAddon() {
  addonForm.value = { name: '', price: 0, image_url: '', is_available: true }
}
function editAddon(a) {
  addonForm.value = { id: a.id, name: a.name, price: Number(a.price), image_url: a.image_url ?? '', is_available: !!a.is_available }
}
async function saveAddon() {
  if (busy.value) return
  busy.value = true
  try {
    const f = addonForm.value
    if (f.id) await api.put(`/api/admin/addons/${f.id}`, f)
    else await api.post('/api/admin/addons', f)
    addonForm.value = null
    await load()
    showToast('Toping tersimpan.')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
async function delAddon(a) {
  if (!confirm(`Hapus toping "${a.name}"?`)) return
  try {
    await api.delete(`/api/admin/addons/${a.id}`)
    await load()
    showToast('Toping dihapus.')
  } catch (e) {
    showError(e)
  }
}

// --- Produk ---
// Form (baru/edit) pindah ke halaman sendiri /admin/produk/…
function goNewProduct() {
  router.push({ name: 'product-new' })
}
function goEditProduct(p) {
  router.push({ name: 'product-edit', params: { id: p.id } })
}
async function delProd(p) {
  if (!confirm(`Hapus produk "${p.name}"?`)) return
  try {
    await api.delete(`/api/admin/products/${p.id}`)
    await load()
    showToast('Produk dihapus.')
  } catch (e) {
    showError(e)
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-4 flex items-center gap-3">
      <h1 class="m-0 text-xl font-bold">Kelola Menu</h1>
      <span class="muted">perubahan langsung terpakai di layar Kasir</span>
    </div>

    <div class="mb-4 flex gap-2">
      <button
        v-for="t in tabs"
        :key="t.id"
        :class="
          tab === t.id
            ? 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground'
            : 'rounded-lg bg-card px-4 py-2 text-sm text-card-foreground shadow-sm hover:bg-muted'
        "
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- ===== Produk ===== -->
    <div v-if="tab === 'products'" class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Produk ({{ data.products.length }})</h2>
        <button class="btn-primary btn-sm" @click="goNewProduct">+ Produk Baru</button>
      </div>

      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-border text-left text-xs text-muted-foreground">
            <th class="py-2 pr-2">Nama</th>
            <th>Kategori</th>
            <th>Harga</th>
            <th>Stasiun</th>
            <th>Varian</th>
            <th>Bahan</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in data.products" :key="p.id" class="border-b border-border">
            <td class="py-2 pr-2 font-semibold">{{ p.name }}</td>
            <td>{{ p.category?.name ?? '—' }}</td>
            <td class="rp">{{ rp(p.base_price) }}</td>
            <td>{{ p.station?.name ?? '—' }}</td>
            <td>{{ p.variants.length }}</td>
            <td>{{ p.ingredients?.length ?? 0 }}</td>
            <td>
              <span
                :class="p.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'"
                class="rounded px-2 py-0.5 text-xs font-semibold"
              >
                {{ p.is_available ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="py-2 text-right whitespace-nowrap">
              <button class="btn-sm bg-muted text-foreground hover:bg-border" @click="goEditProduct(p)">Edit</button>
              <button class="btn-sm ml-1 bg-destructive/10 text-destructive hover:bg-destructive/20" @click="delProd(p)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===== Kategori ===== -->
    <div v-if="tab === 'categories'" class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Kategori ({{ data.categories.length }})</h2>
        <button class="btn-primary btn-sm" @click="newCat">+ Kategori</button>
      </div>

      <div v-if="catForm" class="mb-4 grid grid-cols-[1fr_110px_auto_auto] items-end gap-3 rounded-lg bg-muted p-3">
        <label class="grid gap-1 text-xs text-muted-foreground">
          Nama
          <input v-model="catForm.name" placeholder="mis: Makanan Berat" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Urutan
          <input v-model.number="catForm.sort_order" type="number" min="0" />
        </label>
        <label class="mb-2 flex items-center gap-1.5 text-sm text-foreground">
          <input v-model="catForm.is_active" type="checkbox" /> aktif
        </label>
        <div class="flex gap-2">
          <button class="btn-ghost btn-sm" @click="catForm = null">Batal</button>
          <button class="btn-primary btn-sm" :disabled="busy" @click="saveCat">Simpan</button>
        </div>
        <div class="col-span-full flex items-center gap-3 pt-1">
          <img
            v-if="catForm.image_url"
            :src="catForm.image_url"
            class="h-10 w-10 rounded-lg border border-border object-cover"
            alt=""
          />
          <span v-else class="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border">📷</span>
          <label class="btn-ghost btn-sm inline-flex cursor-pointer items-center">
            Pilih gambar
            <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="pickImage($event, catForm)" />
          </label>
          <button v-if="catForm.image_url" class="btn-sm text-destructive" @click="clearImage(catForm)">✕ hapus</button>
          <span class="muted text-xs">opsional · maks 2 MB</span>
        </div>
      </div>

      <ul class="m-0 list-none gap-0 p-0">
        <li
          v-for="c in data.categories"
          :key="c.id"
          class="flex items-center gap-3 border-b border-border py-2 text-sm"
        >
          <span class="w-8 text-xs text-muted-foreground">#{{ c.sort_order }}</span>
          <span class="flex-1 font-semibold">{{ c.name }}</span>
          <span
            :class="c.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'"
            class="rounded px-2 py-0.5 text-xs font-semibold"
          >
            {{ c.is_active ? 'Aktif' : 'Nonaktif' }}
          </span>
          <button class="btn-sm bg-muted text-foreground hover:bg-border" @click="editCat(c)">Edit</button>
          <button class="btn-sm bg-destructive/10 text-destructive hover:bg-destructive/20" @click="delCat(c)">Hapus</button>
        </li>
      </ul>
    </div>

    <!-- ===== Toping ===== -->
    <div v-if="tab === 'addons'" class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Toping ({{ data.addons.length }})</h2>
        <button class="btn-primary btn-sm" @click="newAddon">+ Toping</button>
      </div>

      <div v-if="addonForm" class="mb-4 grid grid-cols-[1fr_140px_auto_auto] items-end gap-3 rounded-lg bg-muted p-3">
        <label class="grid gap-1 text-xs text-muted-foreground">
          Nama
          <input v-model="addonForm.name" placeholder="mis: Telur Mata Sapi" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Harga
          <input
            :value="moneyFmt(addonForm.price)"
            inputmode="numeric"
            placeholder="mis: 15.000"
            @input="onMoney($event, (d) => (addonForm.price = d))"
          />
        </label>
        <label class="mb-2 flex items-center gap-1.5 text-sm text-foreground">
          <input v-model="addonForm.is_available" type="checkbox" /> tersedia
        </label>
        <div class="flex gap-2">
          <button class="btn-ghost btn-sm" @click="addonForm = null">Batal</button>
          <button class="btn-primary btn-sm" :disabled="busy" @click="saveAddon">Simpan</button>
        </div>
        <div class="col-span-full flex items-center gap-3 pt-1">
          <img
            v-if="addonForm.image_url"
            :src="addonForm.image_url"
            class="h-10 w-10 rounded-lg border border-border object-cover"
            alt=""
          />
          <span v-else class="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border">📷</span>
          <label class="btn-ghost btn-sm inline-flex cursor-pointer items-center">
            Pilih gambar
            <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="pickImage($event, addonForm)" />
          </label>
          <button v-if="addonForm.image_url" class="btn-sm text-destructive" @click="clearImage(addonForm)">✕ hapus</button>
          <span class="muted text-xs">opsional · maks 2 MB</span>
        </div>
      </div>

      <ul class="m-0 list-none p-0">
        <li
          v-for="a in data.addons"
          :key="a.id"
          class="flex items-center gap-3 border-b border-border py-2 text-sm"
        >
          <span class="flex-1 font-semibold">{{ a.name }}</span>
          <span class="rp text-primary">+{{ rp(a.price) }}</span>
          <span
            :class="a.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'"
            class="rounded px-2 py-0.5 text-xs font-semibold"
          >
            {{ a.is_available ? 'Ada' : 'Habis' }}
          </span>
          <button class="btn-sm bg-muted text-foreground hover:bg-border" @click="editAddon(a)">Edit</button>
          <button class="btn-sm bg-destructive/10 text-destructive hover:bg-destructive/20" @click="delAddon(a)">Hapus</button>
        </li>
      </ul>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
