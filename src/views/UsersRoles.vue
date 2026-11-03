<script setup>
import { onMounted, ref } from 'vue'
import api from '../api.js'

// Pengguna & Role (Cara B, Tahap 2): daftar user + penugasan toko & role per toko,
// plus matriks izin per role — semua dinamis dan langsung berlaku di backend/sidebar.
const users = ref([])
const stores = ref([]) // toko yang kelola aktor (tempat ia berperan admin)
const roles = ref([])
const userForm = ref(null)
const roleForm = ref(null)
const toast = ref(null)
const busy = ref(false)

const KEY_LABELS = {
  pos: 'Kasir — buat & bayar nota',
  kds: 'Dapur (KDS)',
  void: 'Batalkan nota belum lunas',
  void_paid: 'Batalkan nota lunas',
  history: 'Riwayat nota',
  shift: 'Shift',
  reports: 'Laporan penjualan',
  tables: 'Manajemen meja',
  menu: 'Kelola menu',
  ingredients: 'Bahan baku',
  users: 'Pengguna & role',
  stores: 'Kelola toko',
}

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
    const [u, r] = await Promise.all([
      api.get('/api/admin/users'),
      api.get('/api/admin/roles'),
    ])
    users.value = u.data.users
    stores.value = u.data.stores
    roles.value = r.data.roles
  } catch (e) {
    showError(e)
  }
}

onMounted(load)

// --- Pengguna ---

function newUser() {
  userForm.value = {
    name: '',
    email: '',
    password: '',
    phone_number: '',
    is_active: true,
    assignments: stores.value.map((s) => ({ store_id: s.id, role: 'cashier', on: false })),
  }
}

function editUser(u) {
  userForm.value = {
    id: u.id,
    name: u.name,
    email: u.email,
    password: '',
    phone_number: u.phone_number ?? '',
    is_active: u.is_active,
    assignments: stores.value.map((s) => {
      const cur = u.stores.find((x) => x.id === s.id)
      return { store_id: s.id, role: cur?.role ?? 'cashier', on: !!cur }
    }),
  }
}

async function saveUser() {
  if (busy.value) return
  const f = userForm.value
  const assigned = f.assignments.filter((a) => a.on)

  if (!f.id && !f.password) return showToast('Password wajib diisi.', true)
  if (!assigned.length) return showToast('Pilih minimal satu toko.', true)

  const payload = {
    name: f.name,
    email: f.email,
    phone_number: f.phone_number,
    is_active: f.is_active,
    stores: assigned.map((a) => ({ store_id: a.store_id, role: a.role })),
  }
  if (f.password) payload.password = f.password

  busy.value = true
  try {
    if (f.id) await api.put(`/api/admin/users/${f.id}`, payload)
    else await api.post('/api/admin/users', payload)
    userForm.value = null
    await load()
    showToast('Pengguna tersimpan.')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}

// --- Role & izin ---

function newRole() {
  roleForm.value = { name: '', label: '', permissions: ['pos'] }
}

function editRole(r) {
  roleForm.value = {
    name: r.name,
    label: r.label,
    permissions: [...r.permissions],
    is_system: r.is_system,
  }
}

function toggleKey(key) {
  const list = roleForm.value.permissions
  const i = list.indexOf(key)
  if (i >= 0) list.splice(i, 1)
  else list.push(key)
}

async function saveRole() {
  if (busy.value) return
  const f = roleForm.value
  if (!f.permissions.length) return showToast('Centang minimal satu izin.', true)

  busy.value = true
  try {
    if (f.name) await api.put(`/api/admin/roles/${encodeURIComponent(f.name)}`, { label: f.label, permissions: f.permissions })
    else await api.post('/api/admin/roles', { name: f.nameInput, label: f.label, permissions: f.permissions })
    roleForm.value = null
    await load()
    showToast('Role tersimpan.')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}

async function delRole(r) {
  if (!confirm(`Hapus role "${r.label}"?`)) return
  try {
    await api.delete(`/api/admin/roles/${encodeURIComponent(r.name)}`)
    await load()
    showToast('Role dihapus.')
  } catch (e) {
    showError(e) //409: sistem / masih dipakai
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <div class="mb-4 flex items-center gap-3">
      <h1 class="m-0 text-xl font-bold">Pengguna &amp; Role</h1>
      <span class="muted">izin berlaku sesuai toko aktif tiap pengguna</span>
    </div>

    <!-- Peran & Izin -->
    <div class="card mb-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Peran &amp; Izin ({{ roles.length }})</h2>
        <button class="btn-primary btn-sm" @click="newRole">+ Role Baru</button>
      </div>

      <div v-if="roleForm" class="mb-4 rounded-lg bg-muted p-3">
        <div class="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label class="grid gap-1 text-xs text-muted-foreground">
            Nama tampilan
            <input v-model="roleForm.label" placeholder="mis: Supervisor Malam" />
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            Kode role (hanya saat baru)
            <input
              v-model="roleForm.nameInput"
              :disabled="!!roleForm.name"
              placeholder="huruf kecil, mis: supervisor"
            />
          </label>
        </div>

        <p class="m-0 mb-2 text-xs font-semibold text-muted-foreground">Izin:</p>
        <div class="grid grid-cols-1 gap-x-4 gap-y-1.5 md:grid-cols-2">
          <label
            v-for="key in Object.keys(KEY_LABELS)"
            :key="key"
            class="flex items-center gap-2 text-sm"
            :class="{ 'opacity-50': roleForm.name === 'admin' }"
          >
            <input
              type="checkbox"
              :checked="roleForm.name === 'admin' || roleForm.permissions.includes(key)"
              :disabled="roleForm.name === 'admin'"
              @change="toggleKey(key)"
            />
            {{ KEY_LABELS[key] }}
          </label>
        </div>
        <p v-if="roleForm.name === 'admin'" class="muted mt-2 text-xs">
          Role admin terkunci — superuser semua izin di tokonya.
        </p>

        <div class="mt-3 flex gap-2">
          <button class="btn-ghost btn-sm" @click="roleForm = null">Batal</button>
          <button class="btn-primary btn-sm" :disabled="busy" @click="saveRole">Simpan</button>
        </div>
      </div>

      <ul class="m-0 list-none p-0">
        <li
          v-for="r in roles"
          :key="r.name"
          class="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm"
        >
          <span class="min-w-32 font-semibold">{{ r.label }}</span>
          <span class="muted text-xs">({{ r.name }})</span>
          <span v-if="r.is_system" class="rounded bg-muted px-1.5 py-0.5 text-xs">sistem</span>
          <span class="muted text-xs">{{ r.user_count }} pengguna</span>
          <span class="muted text-xs">{{ r.permissions.length }} izin</span>
          <span class="ml-auto flex gap-2">
            <button class="btn-ghost btn-sm" @click="editRole(r)">Ubah</button>
            <button
              v-if="!r.is_system && r.user_count === 0"
              class="btn-ghost btn-sm text-destructive"
              @click="delRole(r)"
            >
              Hapus
            </button>
          </span>
        </li>
      </ul>
    </div>

    <!-- Pengguna -->
    <div class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="m-0 text-lg font-bold">Pengguna ({{ users.length }})</h2>
        <button class="btn-primary btn-sm" @click="newUser">+ Pengguna Baru</button>
      </div>

      <div v-if="userForm" class="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-muted p-3 md:grid-cols-3">
        <label class="grid gap-1 text-xs text-muted-foreground">
          Nama
          <input v-model="userForm.name" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Email
          <input v-model="userForm.email" type="email" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          Password <span v-if="userForm.id" class="text-xs">(kosong = tidak diubah)</span>
          <input v-model="userForm.password" type="password" />
        </label>
        <label class="grid gap-1 text-xs text-muted-foreground">
          No. HP
          <input v-model="userForm.phone_number" />
        </label>
        <label class="mb-1 flex items-center gap-1.5 text-sm">
          <input v-model="userForm.is_active" type="checkbox" /> aktif
        </label>

        <div class="md:col-span-3">
          <p class="m-0 mb-1.5 text-xs font-semibold text-muted-foreground">
            Penugasan toko &amp; role:
          </p>
          <div class="flex flex-wrap gap-3">
            <div
              v-for="a in userForm.assignments"
              :key="a.store_id"
              class="flex items-center gap-2 rounded border border-border bg-card px-2.5 py-1.5 text-sm"
            >
              <input v-model="a.on" type="checkbox" />
              <span>{{ stores.find((s) => s.id === a.store_id)?.name }}</span>
              <select v-if="a.on" v-model="a.role" class="rounded border border-border px-1 py-0.5 text-xs">
                <option v-for="r in roles" :key="r.name" :value="r.name">{{ r.label }}</option>
              </select>
            </div>
          </div>
        </div>

        <div class="flex gap-2 md:col-span-3 md:justify-end">
          <button class="btn-ghost btn-sm" @click="userForm = null">Batal</button>
          <button class="btn-primary btn-sm" :disabled="busy" @click="saveUser">Simpan</button>
        </div>
      </div>

      <ul class="m-0 list-none p-0">
        <li
          v-for="u in users"
          :key="u.id"
          class="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm"
        >
          <span class="min-w-36 font-semibold" :class="{ 'opacity-50': !u.is_active }">
            {{ u.name }}
            <span v-if="!u.is_active" class="muted text-xs">· nonaktif</span>
          </span>
          <span class="muted text-xs">{{ u.email }}</span>
          <span class="flex flex-wrap gap-1.5">
            <span
              v-for="s in u.stores"
              :key="s.id"
              class="rounded bg-muted px-1.5 py-0.5 text-xs"
            >
              {{ s.name }} · <b>{{ roles.find((r) => r.name === s.role)?.label ?? s.role }}</b>
            </span>
            <span v-if="!u.stores.length" class="muted text-xs">belum ditugasi</span>
          </span>
          <span class="ml-auto">
            <button class="btn-ghost btn-sm" @click="editUser(u)">Ubah</button>
          </span>
        </li>
        <li v-if="!users.length" class="muted py-4 text-center text-sm">Belum ada pengguna.</li>
      </ul>
    </div>

    <div v-if="toast" :class="['toast-msg', toast.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ toast.message }}
    </div>
  </div>
</template>
