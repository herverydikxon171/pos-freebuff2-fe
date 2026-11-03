<script setup>
import { onMounted, ref } from 'vue'
import api from '../api.js'
import { useAuthStore } from '../stores/auth.js'

// Manajemen toko multi-cabang (Cara B, Tahap 1): daftar + tambah/edit/hapus,
// lengkap dengan pajak & service charge per toko (pengaturan struk).
const stores = ref([])
const form = ref(null)
const toast = ref(null)
const busy = ref(false)
const auth = useAuthStore()

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
    const { data } = await api.get('/api/admin/stores')
    stores.value = data.stores
  } catch (e) {
    showError(e)
  }
}

onMounted(load)

function newStore() {
  form.value = {
    name: '',
    address: '',
    phone_number: '',
    is_active: true,
    tax_name: 'PB1',
    tax_percentage: 10,
    service_charge_percentage: 5,
  }
}

function editStore(s) {
  form.value = {
    id: s.id,
    name: s.name,
    address: s.address ?? '',
    phone_number: s.phone_number ?? '',
    is_active: !!s.is_active,
    tax_name: s.settings?.tax_name ?? 'PB1',
    tax_percentage: Number(s.settings?.tax_percentage ?? 10),
    service_charge_percentage: Number(s.settings?.service_charge_percentage ?? 5),
  }
}

async function saveStore() {
  if (busy.value) return
  busy.value = true
  try {
    const f = form.value
    if (f.id) await api.put(`/api/admin/stores/${f.id}`, f)
    else await api.post('/api/admin/stores', f)
    form.value = null
    await load()
    // Toko baru otomatis menambahkan kita sebagai anggotanya → muat ulang membership.
    await auth.fetchUser()
    showToast('Toko tersimpan.')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}

async function delStore(s) {
  if (!confirm(`Hapus toko "${s.name}"?`)) return
  try {
    await api.delete(`/api/admin/stores/${s.id}`)

    // Toko yang sedang aktif ikut terhapus → pindah dulu sebelum request berikutnya.
    if (s.id === auth.storeId) {
      const next = auth.stores.find((x) => x.id !== s.id)
      if (next) localStorage.setItem('activeStoreId', String(next.id))
      else localStorage.removeItem('activeStoreId')
      window.location.reload()
      return
    }

    await load()
    await auth.fetchUser()
    showToast('Toko dihapus.')
  } catch (e) {
    showError(e) // 409: toko bekas nota/shift/stok → pesan dari server
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-4 flex items-center gap-3">
      <h1 class="m-0 text-xl font-bold">Kelola Toko</h1>
      <span class="muted">pilih toko aktif lewat dropdown di header — semua data mengikuti toko itu</span>
    </div>

    <div class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Toko ({{ stores.length }})</h2>
        <button class="btn-primary btn-sm" @click="newStore">+ Toko Baru</button>
      </div>

      <div
        v-if="form"
        class="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-muted p-3 md:grid-cols-3"
      >
        <label class="grid gap-1 text-xs text-muted-foreground md:col-span-2">
          Nama toko
          <input v-model="form.name" placeholder="mis: Warung Bakmie Sudirman" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Telepon
          <input v-model="form.phone_number" placeholder="0812…" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground md:col-span-3">
          Alamat
          <input v-model="form.address" placeholder="Jl. …" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Nama pajak
          <input v-model="form.tax_name" placeholder="PB1" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Pajak (%)
          <input v-model.number="form.tax_percentage" type="number" min="0" max="100" step="0.5" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Service charge (%)
          <input
            v-model.number="form.service_charge_percentage"
            type="number"
            min="0"
            max="100"
            step="0.5"
          />
        </label>
        <label class="mb-2 flex items-center gap-1.5 text-sm text-foreground">
          <input v-model="form.is_active" type="checkbox" /> aktif
        </label>
        <div class="flex gap-2 md:col-span-2 md:justify-end">
          <button class="btn-ghost btn-sm" @click="form = null">Batal</button>
          <button class="btn-primary btn-sm" :disabled="busy" @click="saveStore">Simpan</button>
        </div>
      </div>

      <ul class="m-0 list-none p-0">
        <li
          v-for="s in stores"
          :key="s.id"
          class="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm"
        >
          <span class="min-w-40 font-semibold" :class="{ 'opacity-50': !s.is_active }">
            {{ s.name }}
            <span v-if="s.id === auth.storeId" class="muted text-xs">· aktif</span>
          </span>
          <span class="muted text-xs">
            pajak {{ s.settings?.tax_name ?? '—' }} {{ Number(s.settings?.tax_percentage ?? 0) }}% ·
            service {{ Number(s.settings?.service_charge_percentage ?? 0) }}%
            <span v-if="s.phone_number"> · {{ s.phone_number }}</span>
          </span>
          <span class="muted ml-auto text-xs">{{ s.address }}</span>
          <span class="flex gap-2">
            <button class="btn-ghost btn-sm" @click="editStore(s)">Ubah</button>
            <button class="btn-ghost btn-sm text-destructive" @click="delStore(s)">Hapus</button>
          </span>
        </li>
        <li v-if="!stores.length" class="muted py-4 text-center text-sm">Belum ada toko.</li>
      </ul>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
