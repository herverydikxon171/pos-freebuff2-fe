<script setup>
import { nextTick } from 'vue'

// Area cetak struk bersama (Kasir & halaman Bayar): tersembunyi di layar,
// tampil hanya saat body.printing-bill + window.print().
const props = defineProps({
  order: { type: Object, default: null },
  storeName: { type: String, default: '' },
  storeAddress: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  settings: {
    type: Object,
    default: () => ({ tax_percentage: 0, service_charge_percentage: 0 }),
  },
  printedAt: { type: String, default: '' },
})

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')
const typeLabel = { dine_in: 'Dine In', take_away: 'Take Away', delivery: 'Delivery' }

function billStatus(o) {
  if (o.voided_at) return 'DIBATALKAN'
  return (
    { unpaid: 'BELUM DIBAYAR', partial: 'BELUM LUNAS', paid: 'LUNAS', refunded: 'REFUND' }[
      o.payment_status
    ] ?? o.payment_status
  )
}

function billDue(o) {
  const paid = (o.payments ?? [])
    .filter((p) => p.status === 'success')
    .reduce((s, p) => s + Number(p.amount), 0)
  return Math.max(0, Number(o.total_amount) - paid)
}

// Buka dialog cetak setelah DOM struk ter-update (pemanggil mengisi printedAt dulu).
async function print() {
  if (!props.order) return
  await nextTick()
  // Paksa kertas thermal 58mm tanpa margin — hanya selama cetak struk ini;
  // dilepas di cleanup supaya cetak laporan tetap mengikuti kertas A4.
  const pageStyle = document.createElement('style')
  pageStyle.id = 'bill-page-58mm'
  pageStyle.textContent = '@page { size: 58mm auto; margin: 0 }'
  document.head.appendChild(pageStyle)
  document.body.classList.add('printing-bill')
  const cleanup = () => {
    document.body.classList.remove('printing-bill')
    pageStyle.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(() => window.print(), 60)
  // Fallback bila afterprint tidak terpicu.
  setTimeout(cleanup, 2000)
}

defineExpose({ print })
</script>

<template>
  <div class="print-bill-area">
    <template v-if="order">
      <div class="text-center">
        <img
          v-if="logoUrl"
          :src="logoUrl"
          alt="Logo"
          class="mx-auto mb-1 h-12 w-auto object-contain"
        />
        <div class="text-lg font-bold">{{ storeName || 'Bakmie POS' }}</div>
        <div class="text-xs">{{ storeAddress }}</div>
      </div>

      <div class="my-2 border-t border-dashed border-black"></div>
      <div class="text-sm">
        <div class="flex justify-between">
          <span>No. Nota</span><span class="font-semibold">{{ order.order_number }}</span>
        </div>
        <div class="flex justify-between">
          <span>Waktu</span><span>{{ new Date(order.created_at).toLocaleString('id-ID') }}</span>
        </div>
        <div v-if="order.table" class="flex justify-between">
          <span>Meja</span><span>{{ order.table.table_number }} ({{ order.table.area }})</span>
        </div>
        <div class="flex justify-between">
          <span>Tipe</span><span>{{ typeLabel[order.order_type] ?? order.order_type }}</span>
        </div>
        <div class="flex justify-between font-bold">
          <span>Status</span><span>{{ billStatus(order) }}</span>
        </div>
      </div>

      <div class="my-2 border-t border-dashed border-black"></div>
      <div class="text-sm">
        <div v-for="it in order.items" :key="it.id" class="mb-1.5">
          <div class="flex justify-between gap-2">
            <span>{{ it.quantity }}× {{ it.product_name_snapshot }}</span>
            <span>{{ rp(it.subtotal) }}</span>
          </div>
          <div v-if="it.variants?.length" class="text-xs">
            └ {{ it.variants.map((v) => v.variant_name_snapshot).join(', ') }}
          </div>
          <div v-if="it.addons?.length" class="text-xs">
            └ + {{ it.addons.map((a) => `${a.addon_name_snapshot} ×${a.quantity}`).join(', ') }}
          </div>
          <div v-if="it.participant_name" class="text-xs">👤 {{ it.participant_name }}</div>
          <div v-if="it.notes" class="text-xs">📝 {{ it.notes }}</div>
        </div>
      </div>

      <div class="my-2 border-t border-dashed border-black"></div>
      <div class="text-sm">
        <div class="flex justify-between"><span>Subtotal</span><span>{{ rp(order.subtotal) }}</span></div>
        <div v-if="Number(order.discount_amount)" class="flex justify-between">
          <span>Diskon</span><span>−{{ rp(order.discount_amount) }}</span>
        </div>
        <div class="flex justify-between">
          <span>{{ settings.tax_name ?? 'Pajak' }} ({{ settings.tax_percentage }}%)</span>
          <span>{{ rp(order.tax_amount) }}</span>
        </div>
        <div class="flex justify-between">
          <span>Service ({{ settings.service_charge_percentage }}%)</span>
          <span>{{ rp(order.service_charge_amount) }}</span>
        </div>
        <div class="flex justify-between text-base font-bold">
          <span>TOTAL</span><span>{{ rp(order.total_amount) }}</span>
        </div>
      </div>

      <div v-if="order.payments?.length" class="mt-2 text-sm">
        <div class="my-1.5 border-t border-dashed border-black"></div>
        <div v-for="p in order.payments" :key="p.id" class="flex justify-between">
          <span>{{ p.method?.name ?? 'Bayar' }}<span v-if="p.status !== 'success'"> ({{ p.status }})</span></span>
          <span>{{ rp(p.amount) }}</span>
        </div>
        <div class="flex justify-between font-semibold">
          <span>Sisa tagihan</span><span>{{ rp(billDue(order)) }}</span>
        </div>
      </div>

      <div class="my-2 border-t border-dashed border-black"></div>
      <div class="text-center text-xs">
        <div>Terima kasih atas kunjungan Anda 🍜</div>
        <div>Dicetak {{ printedAt }}</div>
      </div>
    </template>
  </div>
</template>
