import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'
import Login from './views/Login.vue'
import Pos from './views/Pos.vue'
import Kds from './views/Kds.vue'
import AdminMenu from './views/AdminMenu.vue'
import ProductForm from './views/ProductForm.vue'
import Tables from './views/Tables.vue'
import Ingredients from './views/Ingredients.vue'
import Reports from './views/Reports.vue'
import Shift from './views/Shift.vue'
import Pay from './views/Pay.vue'
import History from './views/History.vue'
import SelfOrder from './views/SelfOrder.vue'
import SelfOrderCart from './views/SelfOrderCart.vue'

// RBAC: role karyawan yang boleh membuka tiap halaman (pelanggan = rute /qr tanpa login).
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login },
    { path: '/', name: 'pos', component: Pos, meta: { auth: true, roles: ['admin', 'cashier', 'manager'] } },
    { path: '/kds', name: 'kds', component: Kds, meta: { auth: true, roles: ['admin', 'kitchen', 'manager'] } },
    { path: '/admin', name: 'admin', component: AdminMenu, meta: { auth: true, admin: true } },
    // Form produk jadi halaman sendiri (bukan modal) — baru & edit.
    { path: '/admin/produk/baru', name: 'product-new', component: ProductForm, meta: { auth: true, admin: true } },
    { path: '/admin/produk/:id', name: 'product-edit', component: ProductForm, meta: { auth: true, admin: true } },
    // Manajemen meja (sidebar) — admin saja.
    { path: '/admin/meja', name: 'tables', component: Tables, meta: { auth: true, admin: true } },
    // Bahan baku (BOM) — pindahan tab Kelola Menu jadi halaman sidebar.
    { path: '/admin/bahan', name: 'ingredients', component: Ingredients, meta: { auth: true, admin: true } },
    { path: '/reports', name: 'reports', component: Reports, meta: { auth: true, roles: ['admin', 'manager'] } },
    { path: '/shifts', name: 'shifts', component: Shift, meta: { auth: true, roles: ['admin', 'cashier', 'manager'] } },
    // Halaman bayar terpisah: dibuka dari Riwayat / "Buat Nota & Bayar".
    { path: '/bayar/:id', name: 'pay', component: Pay, meta: { auth: true, roles: ['admin', 'cashier', 'manager'] } },
    // Riwayat nota harian terpisah (dulu modal di halaman Kasir).
    { path: '/riwayat', name: 'history', component: History, meta: { auth: true, roles: ['admin', 'cashier', 'manager'] } },
    // Halaman pelanggan (scan QR): tanpa auth — akses berbasis kode sesi.
    { path: '/qr/:code', name: 'selforder', component: SelfOrder },
    // Halaman keranjang terpisah dari menu (mobile-first).
    { path: '/qr/:code/cart', name: 'selforder-cart', component: SelfOrderCart },
  ],
})

// Halaman awal sesuai role: dapur masuk ke KDS, sisanya ke Kasir.
const homeFor = (role) => (role === 'kitchen' ? 'kds' : 'pos')

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.fetchUser()
  if (to.meta.auth && !auth.isAuthenticated) return { name: 'login' }
  if (to.name === 'login' && auth.isAuthenticated) return { name: homeFor(auth.user?.role) }
  if (to.meta.admin && auth.user?.role !== 'admin') return { name: homeFor(auth.user?.role) }
  // RBAC halaman: role di luar daftar dialihkan ke halaman aman miliknya.
  if (to.meta.roles && !to.meta.roles.includes(auth.user?.role)) {
    return { name: homeFor(auth.user?.role) }
  }
})

export default router
