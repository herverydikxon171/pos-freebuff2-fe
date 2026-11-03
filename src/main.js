import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router.js'
import { initTheme } from './theme.js'
import './style.css'

// Tema diterapkan sebelum mount agar tidak ada kilatan warna salah.
initTheme()

createApp(App).use(createPinia()).use(router).mount('#app')
