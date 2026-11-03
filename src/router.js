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
import Stores from './views/Stores.vue'
import UsersRoles from './views/UsersRoles.vue'

// RBAC (Cara B, Tahap 2): tiap halaman menyebut izin toko AKTIF yang dibutuhkan
// (meta.perm; boleh array = any-of). Pelanggan = rute /qr tanpa login.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login },
    { path: '/', name: 'pos', component: Pos, meta: { auth: true, perm: 'pos' } },
    { path: '/kds', name: 'kds', component: Kds, meta: { auth: true, perm: 'kds' } },
    { path: '/admin', name: 'admin', component: AdminMenu, meta: { auth: true, perm: 'menu' } },
    // Form produk jadi halaman sendiri (bukan modal) — baru & edit.
    { path: '/admin/produk/baru', name: 'product-new', component: ProductForm, meta: { auth: true, perm: 'menu' } },
    { path: '/admin/produk/:id', name: 'product-edit', component: ProductForm, meta: { auth: true, perm: 'menu' } },
    // Manajemen meja (sidebar).
    { path: '/admin/meja', name: 'tables', component: Tables, meta: { auth: true, perm: 'tables' } },
    // Bahan baku (BOM) — pindahan tab Kelola Menu jadi halaman sidebar.
    { path: '/admin/bahan', name: 'ingredients', component: Ingredients, meta: { auth: true, perm: 'ingredients' } },
    // Manajemen toko multi-cabang (Cara B).
    { path: '/admin/toko', name: 'stores', component: Stores, meta: { auth: true, perm: 'stores' } },
    // Pengguna & role (Cara B, Tahap 2).
    { path: '/admin/pengguna', name: 'users', component: UsersRoles, meta: { auth: true, perm: 'users' } },
    { path: '/reports', name: 'reports', component: Reports, meta: { auth: true, perm: 'reports' } },
    { path: '/shifts', name: 'shifts', component: Shift, meta: { auth: true, perm: 'shift' } },
    // Halaman bayar terpisah: dibuka dari Riwayat / "Buat Nota & Bayar".
    { path: '/bayar/:id', name: 'pay', component: Pay, meta: { auth: true, perm: 'pos' } },
    // Riwayat nota harian terpisah (dulu modal di halaman Kasir).
    { path: '/riwayat', name: 'history', component: History, meta: { auth: true, perm: 'history' } },
    // Halaman pelanggan (scan QR): tanpa auth — akses berbasis kode sesi.
    { path: '/qr/:code', name: 'selforder', component: SelfOrder },
    // Halaman keranjang terpisah dari menu (mobile-first).
    { path: '/qr/:code/cart', name: 'selforder-cart', component: SelfOrderCart },
  ],
})

// Halaman awal sesuai izin toko aktif: punya izin kasir → Kasir, selain itu KDS.
const homeFor = (auth) => (auth.has('pos') ? 'pos' : 'kds')

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.fetchUser()
  if (to.meta.auth && !auth.isAuthenticated) return { name: 'login' }
  if (to.name === 'login' && auth.isAuthenticated) return { name: homeFor(auth) }
  // RBAC halaman: izin toko aktif (any-of bila berupa array).
  if (to.meta.perm) {
    const needed = Array.isArray(to.meta.perm) ? to.meta.perm : [to.meta.perm]
    if (!needed.some((p) => auth.has(p))) return { name: homeFor(auth) }
  }
})

export default router
