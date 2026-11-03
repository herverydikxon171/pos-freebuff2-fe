<script setup>
import { computed, ref, watch } from 'vue'
import api from '../api.js'

// Dipakai bersama oleh Reports, KDS, dan POS: order null = tertutup.
const props = defineProps({ order: { type: Object, default: null } })
const emit = defineEmits(['close', 'confirmed'])

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

const reason = ref('')
const error = ref('')
const busy = ref(false)

watch(() => props.order, () => {
  reason.value = ''
  error.value = ''
})

// Sudah ada uang masuk: dari row laporan (paid_amount) atau relasi payments (KDS).
const paid = computed(() => {
  const o = props.order
  if (!o) return 0
  if (o.paid_amount != null) return Number(o.paid_amount)
  return (o.payments ?? [])
    .filter((p) => p.status === 'success')
    .reduce((s, p) => s + Number(p.amount), 0)
})

async function confirm() {
  if (reason.value.trim().length < 3 || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.post(`/api/orders/${props.order.id}/void`, { reason: reason.value.trim() })
    emit('confirmed')
  } catch (e) {
    const data = e.response?.data
    error.value =
      data?.message || (data?.errors ? Object.values(data.errors)[0][0] : 'Gagal membatalkan nota.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="order" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal max-w-md">
      <h3 class="mb-1 mt-0 text-lg font-bold text-destructive">Batalkan Nota</h3>
      <p class="muted mb-3 text-sm">
        <span class="font-semibold">{{ order.order_number }}</span>
        — total <span class="rp font-semibold">{{ rp(order.total_amount) }}</span>.
        <template v-if="paid > 0">
          Sudah dibayar <span class="rp">{{ rp(paid) }}</span>
          → uang <b>dikembalikan (refund)</b> dan nota keluar dari laporan.
        </template>
        Pembatalan tercatat permanen di jejak audit.
      </p>
      <textarea
        v-model="reason"
        rows="2"
        class="w-full"
        placeholder="Alasan pembatalan (wajib, min. 3 karakter)"
      />
      <div v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-ghost btn-sm" @click="emit('close')">Tutup</button>
        <button
          class="btn-sm rounded bg-destructive px-3 font-semibold text-white disabled:opacity-50"
          :disabled="reason.trim().length < 3 || busy"
          @click="confirm"
        >
          {{ busy ? 'Memproses…' : 'Ya, Batalkan' }}
        </button>
      </div>
    </div>
  </div>
</template>
