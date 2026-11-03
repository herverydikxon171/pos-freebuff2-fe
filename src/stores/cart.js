import { defineStore } from 'pinia'

// Keranjang & konteks nota kasir disimpan di store (bukan ref komponen) supaya
// selamat saat kasir pindah ke halaman Bayar dan kembali — POS unmount saat
// rute berganti, jadi state komponen akan hilang.
export const useCartStore = defineStore('cart', {
  state: () => ({
    cart: [],
    opts: {
      order_type: 'dine_in',
      table_id: '',
      payment_timing: 'pay_later',
      channel_id: '',
    },
    phone: '',
    member: null,
    redeemPoints: 0,
  }),
})
