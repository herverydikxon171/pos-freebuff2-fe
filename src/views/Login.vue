<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()

const email = ref('admin@example.com')
const password = ref('password')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.login(email.value, password.value)
    router.push({ name: 'pos' })
  } catch (e) {
    error.value = e.response?.data?.message || 'Login gagal. Coba lagi.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <form
      class="grid w-[min(380px,92vw)] gap-3 rounded-2xl bg-card px-6 py-7 text-center text-card-foreground shadow-xl"
      @submit.prevent="submit"
    >
      <div class="text-4xl">🍜</div>
      <h1 class="m-0 text-xl font-bold">Bakmie POS</h1>
      <p class="muted">Masuk untuk membuka kasir.</p>

      <label class="grid gap-1 text-left text-xs font-medium text-muted-foreground">
        Email
        <input v-model="email" type="email" required autocomplete="username" />
      </label>
      <label class="grid gap-1 text-left text-xs font-medium text-muted-foreground">
        Password
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>

      <p v-if="error" class="m-0 text-xs text-destructive">{{ error }}</p>

      <button class="btn-primary" type="submit" :disabled="busy">
        {{ busy ? 'Masuk…' : 'Masuk' }}
      </button>

      <p class="muted">Demo: admin@example.com / password</p>
    </form>
  </div>
</template>
