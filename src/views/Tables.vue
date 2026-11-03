<script setup>
import { onMounted, ref } from 'vue'
import api from '../api.js'

// Manajemen meja + papan status langsung (sesi QR terbuka / nota berjalan).
const data = ref([])
const form = ref(null)
const toast = ref(null)
const busy = ref(false)

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
    const { data: d } = await api.get('/api/admin/tables')
    data.value = d
  } catch (e) {
    showError(e)
  }
}

onMounted(load)

function newTable() {
  form.value = { table_number: '', capacity: 4, area: '', is_active: true }
}
function editTable(t) {
  form.value = {
    id: t.id,
    table_number: t.table_number,
    capacity: t.capacity,
    area: t.area ?? '',
    is_active: !!t.is_active,
  }
}
async function saveTable() {
  if (busy.value) return
  busy.value = true
  try {
    const f = form.value
    if (f.id) await api.put(`/api/admin/tables/${f.id}`, f)
    else await api.post('/api/admin/tables', f)
    form.value = null
    await load()
    showToast('Meja tersimpan.')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
async function delTable(t) {
  if (!confirm(`Hapus meja "${t.table_number}"?`)) return
  try {
    await api.delete(`/api/admin/tables/${t.id}`)
    await load()
    showToast('Meja dihapus.')
  } catch (e) {
    showError(e) // 409: meja bekas nota → arahkan nonaktifkan
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-4 flex items-center gap-3">
      <h1 class="m-0 text-xl font-bold">Kelola Meja</h1>
      <span class="muted">meja nonaktif otomatis hilang dari pilihan Kasir & QR</span>
    </div>

    <div class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Meja ({{ data.length }})</h2>
        <button class="btn-primary btn-sm" @click="newTable">+ Meja Baru</button>
      </div>

      <div
        v-if="form"
        class="mb-4 grid grid-cols-[1fr_110px_140px_auto_auto] items-end gap-3 rounded-lg bg-muted p-3"
      >
        <label class="grid gap-1 text-xs text-muted-foreground">
          Nomor meja
          <input v-model="form.table_number" placeholder="mis: 5" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Kapasitas
          <input v-model.number="form.capacity" type="number" min="1" max="999" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Area
          <input v-model="form.area" placeholder="mis: Indoor" />
        </label>
        <label class="mb-2 flex items-center gap-1.5 text-sm text-foreground">
          <input v-model="form.is_active" type="checkbox" /> aktif
        </label>
        <div class="flex gap-2">
          <button class="btn-ghost btn-sm" @click="form = null">Batal</button>
          <button class="btn-primary btn-sm" :disabled="busy" @click="saveTable">Simpan</button>
        </div>
      </div>

      <ul class="m-0 list-none p-0">
        <li
          v-for="t in data"
          :key="t.id"
          class="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm"
        >
          <span class="w-20 font-semibold" :class="{ 'line-through opacity-50': !t.is_active }">
            {{ t.table_number }}
          </span>
          <span class="muted text-xs">{{ t.capacity }} kursi<span v-if="t.area"> · {{ t.area }}</span></span>

          <!-- Status langsung: papan tahu meja mana yang sedang dipakai. -->
          <span
            v-if="t.open_sessions > 0"
            class="rounded bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800"
          >
            🔗 Sesi QR terbuka
          </span>
          <span
            v-if="t.active_orders > 0"
            class="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
          >
            🍽 {{ t.active_orders }} nota berjalan
          </span>

          <span
            :class="t.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'"
            class="ml-auto rounded px-2 py-0.5 text-xs font-semibold"
          >
            {{ t.is_active ? 'Aktif' : 'Nonaktif' }}
          </span>
          <button class="btn-sm bg-muted text-foreground hover:bg-border" @click="editTable(t)">Edit</button>
          <button
            class="btn-sm bg-destructive/10 text-destructive hover:bg-destructive/20"
            @click="delTable(t)"
          >
            Hapus
          </button>
        </li>
      </ul>

      <p v-if="!data.length" class="muted py-6 text-center text-sm">
        Belum ada meja — klik <b>+ Meja Baru</b>.
      </p>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
