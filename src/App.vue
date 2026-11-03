<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from './api.js'
import { useAuthStore } from './stores/auth.js'
import { THEMES, setTheme } from './theme.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const theme = ref(document.documentElement.dataset.theme || 'light')
const sidebarOpen = ref(false)

// Logo struk: admin klik brand sidebar → pilih file → tampil di sidebar & struk.
const logoUrl = ref('')
const logoInput = ref(null)
const logoMsg = ref(null)

onMounted(async () => {
  try {
    const { data } = await api.get('/api/meta')
    logoUrl.value = data.store?.settings?.logo_url ?? ''
  } catch {
    /* tanpa logo juga tidak apa */
  }
})

function showLogoMsg(message, isError = false) {
  logoMsg.value = { message, isError }
  setTimeout(() => (logoMsg.value = null), 3000)
}

async function uploadLogo(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const form = new FormData()
    form.append('image', file)
    const { data } = await api.post('/api/admin/images', form)
    const { data: s } = await api.put('/api/admin/settings/logo', { logo_url: data.url })
    logoUrl.value = s.settings?.logo_url ?? data.url
    showLogoMsg('Logo struk diperbarui ✓')
  } catch (err) {
    showLogoMsg(err.response?.data?.message || 'Gagal mengganti logo.', true)
  }
}

// Halaman pelanggan (semua di bawah /qr/...) tampil bersih tanpa kerangka admin,
// walau HP-nya masih login sebagai kasir/admin. Pakai path, bukan daftar nama rute,
// supaya rute pelanggan baru ikut tercakup otomatis.
const isCustomerPage = computed(() => route.path.startsWith('/qr/'))

// Tutup drawer tiap pindah halaman (mobile).
router.afterEach(() => (sidebarOpen.value = false))

const menu = [
  { to: 'pos', icon: '🧾', label: 'Kasir' },
  { to: 'kds', icon: '👨\u200d🍳', label: 'Dapur (KDS)' },
  { to: 'reports', icon: '📊', label: 'Laporan' },
  { to: 'shifts', icon: '🕐', label: 'Shift' },
  { to: 'tables', icon: '🪑', label: 'Meja' },
  { to: 'ingredients', icon: '🧂', label: 'Bahan' },
]

// RBAC: role karyawan yang boleh melihat tiap menu sidebar.
const menuRoles = {
  pos: ['admin', 'cashier', 'manager'],
  kds: ['admin', 'kitchen', 'manager'],
  reports: ['admin', 'manager'],
  shifts: ['admin', 'cashier', 'manager'],
  tables: ['admin'],
  ingredients: ['admin'],
}
const visibleMenu = computed(() => menu.filter((m) => (menuRoles[m.to] ?? []).includes(auth.user?.role)))

const sideClass = (name) =>
  route.name === name
    ? 'flex items-center gap-2.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground'
    : 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-header-foreground/70 hover:bg-white/10 hover:text-header-foreground'

function cycleTheme() {
  const i = THEMES.findIndex((t) => t.id === theme.value)
  const next = THEMES[(i + 1) % THEMES.length]
  theme.value = next.id
  setTheme(next.id)
}

async function doLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <!-- Halaman pelanggan (/qr/:code) selalu tampil bersih tanpa kerangka admin. -->
  <div v-if="auth.isAuthenticated && !isCustomerPage" class="flex min-h-screen">
    <!-- Overlay peneduh saat drawer terbuka (di bawah lebar tablet) -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-30 bg-black/50 md:hidden"
      @click="sidebarOpen = false"
    ></div>

    <!-- Site menu: sidebar menempel di samping sejak lebar tablet (md), jadi drawer hanya di HP -->
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col bg-header text-header-foreground transition-transform md:static md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
    >
      <div class="flex items-center justify-between px-4 py-3.5 text-base font-bold">
        <button
          v-if="auth.user?.role === 'admin'"
          type="button"
          class="flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 font-bold hover:bg-white/10"
          title="Klik untuk mengganti logo struk"
          @click="logoInput?.click()"
        >
          <img v-if="logoUrl" :src="logoUrl" alt="Logo" class="h-7 w-7 shrink-0 rounded object-cover" />
          <span v-else>🍜</span>
          <span class="truncate">Bakmie POS</span>
        </button>
        <span v-else>🍜 Bakmie POS</span>
        <button class="rounded-md p-1 hover:bg-white/10 md:hidden" aria-label="Tutup menu" @click="sidebarOpen = false">✕</button>
        <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="uploadLogo" />
      </div>
      <nav class="flex flex-1 flex-col gap-1 px-2">
        <RouterLink v-for="m in visibleMenu" :key="m.to" :to="{ name: m.to }" :class="sideClass(m.to)">
          <span>{{ m.icon }}</span> {{ m.label }}
        </RouterLink>
        <RouterLink v-if="auth.user?.role === 'admin'" :to="{ name: 'admin' }" :class="sideClass('admin')">
          <span>✏️</span> Menu
        </RouterLink>
      </nav>
      <div class="border-t border-header-foreground/15 px-4 py-3 text-xs text-header-foreground/70">
        {{ auth.user?.name }} · {{ auth.user?.role }}
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 md:justify-end md:px-5">
        <button
          class="rounded-lg border border-border p-2 text-sm hover:bg-muted md:hidden"
          aria-label="Buka menu"
          @click="sidebarOpen = true"
        >
          ☰
        </button>
        <div class="ml-auto flex items-center gap-3 md:ml-0">
          <button
            class="rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
            :title="'Tema: ' + (THEMES.find((t) => t.id === theme)?.label ?? theme)"
            @click="cycleTheme"
          >
            {{ THEMES.find((t) => t.id === theme)?.icon }}
          </button>
          <button class="btn-ghost btn-sm" @click="doLogout">Keluar</button>
        </div>
      </header>
      <main class="flex-1 px-5 py-4">
        <RouterView />
      </main>
    </div>

    <div v-if="logoMsg" :class="['toast-msg', logoMsg.isError ? 'bg-destructive' : 'bg-emerald-800']">
      {{ logoMsg.message }}
    </div>
  </div>
  <RouterView v-else />
</template>
