import { defineStore } from 'pinia'
import api from '../api.js'
import { useCartStore } from './cart.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    ready: false,
    loading: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    stores: (state) => state.user?.stores ?? [],
    // Toko aktif (Cara B): pilihan tersimpan di localStorage selama masih
    // termasuk membership user — kalau tidak, jatuh ke toko pertama.
    storeId(state) {
      const list = state.user?.stores ?? []
      if (!list.length) return null
      const saved = Number(localStorage.getItem('activeStoreId'))
      return list.some((s) => s.id === saved) ? saved : list[0].id
    },
    activeStore() {
      return this.stores.find((s) => s.id === this.storeId) ?? null
    },
    // Izin toko aktif dari /api/me — semua guard frontend memakai has().
    perms: (state) => state.user?.permissions ?? [],
    has() {
      return (key) => this.perms.includes(key)
    },
  },

  actions: {
    async fetchUser() {
      try {
        const { data } = await api.get('/api/me')
        this.user = data.user
        this.syncActiveStore()
      } catch {
        this.user = null
      } finally {
        this.ready = true
      }
    },

    async login(email, password) {
      this.loading = true
      try {
        // Pilihan toko lama tidak berlaku untuk user berikutnya — bersihkan dulu
        // supaya login tidak ditolak header X-Store-Id milik user sebelumnya.
        localStorage.removeItem('activeStoreId')
        await api.get('/sanctum/csrf-cookie')
        const { data } = await api.post('/api/login', { email, password })
        this.user = data.user
        this.syncActiveStore()
        this.ready = true
      } finally {
        this.loading = false
      }
    },

    // Samakan pilihan toko tersimpan dengan membership user yang sedang login.
    syncActiveStore() {
      const list = this.user?.stores ?? []
      const saved = Number(localStorage.getItem('activeStoreId'))
      if (!list.length) {
        localStorage.removeItem('activeStoreId')
      } else if (!list.some((s) => s.id === saved)) {
        localStorage.setItem('activeStoreId', String(list[0].id))
      }
    },

    setActiveStore(id) {
      localStorage.setItem('activeStoreId', String(id))
      // Meta/katalog/laporan di layar masih milik toko lama — muat ulang bersih.
      window.location.reload()
    },

    async logout() {
      try {
        await api.post('/api/logout')
      } finally {
        this.user = null
        // Keranjang kasir tidak boleh bocor ke pengguna berikutnya di perangkat ini.
        useCartStore().$reset()
      }
    },
  },
})
