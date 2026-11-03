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
    storeId: (state) => state.user?.stores?.[0]?.id ?? null,
  },

  actions: {
    async fetchUser() {
      try {
        const { data } = await api.get('/api/me')
        this.user = data.user
      } catch {
        this.user = null
      } finally {
        this.ready = true
      }
    },

    async login(email, password) {
      this.loading = true
      try {
        await api.get('/sanctum/csrf-cookie')
        const { data } = await api.post('/api/login', { email, password })
        this.user = data.user
        this.ready = true
      } finally {
        this.loading = false
      }
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
