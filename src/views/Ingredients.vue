<script setup>
import { onMounted, ref } from 'vue'
import api from '../api.js'
import { moneyFmt, onMoney } from '../money.js'

// Bahan baku (BOM) — pindahan tab "Bahan" dari Kelola Menu jadi halaman sidebar.
const data = ref([])
const ingForm = ref(null)
const toast = ref(null)
const busy = ref(false)
const uploading = ref(false)

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

async function load() {
  try {
    const { data: d } = await api.get('/api/admin/menu')
    data.value = d.ingredients
  } catch (e) {
    showError(e)
  }
}

onMounted(load)

// Unggah gambar bahan — endpoint sama dengan produk/kategori/toping.
async function pickImage(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('image', file)
    const { data: d } = await api.post('/api/admin/images', fd)
    ingForm.value.image_url = d.url
    showToast('Gambar terunggah.')
  } catch (err) {
    showError(err)
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}
function clearImage() {
  ingForm.value.image_url = ''
}

function newIng() {
  ingForm.value = { id: null, name: '', image_url: '', unit: 'gr', cost_per_unit: 0, requires_batch_tracking: true, is_active: true }
}
function editIng(i) {
  ingForm.value = {
    id: i.id,
    name: i.name,
    image_url: i.image_url ?? '',
    unit: i.unit,
    cost_per_unit: Number(i.cost_per_unit),
    requires_batch_tracking: !!i.requires_batch_tracking,
    is_active: !!i.is_active,
  }
}
async function saveIng() {
  if (busy.value) return
  busy.value = true
  try {
    const f = ingForm.value
    if (f.id) await api.put(`/api/admin/ingredients/${f.id}`, f)
    else await api.post('/api/admin/ingredients', f)
    ingForm.value = null
    await load()
    showToast('Bahan tersimpan.')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
async function delIng(i) {
  if (!confirm(`Hapus bahan "${i.name}"?`)) return
  try {
    await api.delete(`/api/admin/ingredients/${i.id}`)
    await load()
    showToast('Bahan dihapus.')
  } catch (e) {
    showError(e)
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-4 flex items-center gap-3">
      <h1 class="m-0 text-xl font-bold">Bahan Baku</h1>
      <span class="muted">resep (BOM) & stok — dipakai di form produk</span>
    </div>

    <div class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Bahan ({{ data.length }})</h2>
        <button class="btn-primary btn-sm" @click="newIng">+ Bahan</button>
      </div>

      <div v-if="ingForm" class="mb-4 grid grid-cols-[1fr_80px_120px_auto_auto] items-end gap-3 rounded-lg bg-muted p-3">
        <label class="grid gap-1 text-xs text-muted-foreground">
          Nama
          <input v-model="ingForm.name" placeholder="mis: Mie Mentah" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Satuan
          <input v-model="ingForm.unit" placeholder="gr" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Harga / satuan
          <input
            :value="moneyFmt(ingForm.cost_per_unit)"
            inputmode="numeric"
            placeholder="mis: 12.500"
            @input="onMoney($event, (d) => (ingForm.cost_per_unit = d))"
          />
        </label>
        <label class="mb-2 flex items-center gap-1.5 text-sm text-foreground">
          <input v-model="ingForm.is_active" type="checkbox" /> aktif
        </label>
        <div class="flex gap-2">
          <button class="btn-ghost btn-sm" @click="ingForm = null">Batal</button>
          <button class="btn-primary btn-sm" :disabled="busy" @click="saveIng">Simpan</button>
        </div>
        <div class="col-span-full flex items-center gap-3 pt-1">
          <img
            v-if="ingForm.image_url"
            :src="ingForm.image_url"
            class="h-10 w-10 rounded-lg border border-border object-cover"
            alt=""
          />
          <span v-else class="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border">📷</span>
          <label class="btn-ghost btn-sm inline-flex cursor-pointer items-center">
            Pilih gambar
            <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="pickImage" />
          </label>
          <button v-if="ingForm.image_url" class="btn-sm text-destructive" @click="clearImage">✕ hapus</button>
          <span class="muted text-xs">opsional · maks 2 MB</span>
        </div>
        <label class="col-span-5 -mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input v-model="ingForm.requires_batch_tracking" type="checkbox" />
          Lacak batch FEFO (pakai tanggal kedaluwarsa terdekat)
        </label>
      </div>

      <ul class="m-0 list-none p-0">
        <li
          v-for="i in data"
          :key="i.id"
          class="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm"
        >
          <img
            v-if="i.image_url"
            :src="i.image_url"
            class="h-8 w-8 rounded border border-border object-cover"
            alt=""
          />
          <span class="flex-1 font-semibold">{{ i.name }}</span>
          <span class="muted text-xs">{{ i.unit }} · {{ rp(i.cost_per_unit) }}/{{ i.unit }}</span>
          <span
            v-if="!i.requires_batch_tracking"
            class="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
          >
            tanpa FEFO
          </span>
          <span
            :class="i.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'"
            class="rounded px-2 py-0.5 text-xs font-semibold"
          >
            {{ i.is_active ? 'Aktif' : 'Nonaktif' }}
          </span>
          <button class="btn-sm bg-muted text-foreground hover:bg-border" @click="editIng(i)">Edit</button>
          <button class="btn-sm bg-destructive/10 text-destructive hover:bg-destructive/20" @click="delIng(i)">Hapus</button>
        </li>
      </ul>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
