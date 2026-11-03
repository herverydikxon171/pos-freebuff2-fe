import axios from 'axios'

// withXSRFToken: kirim X-XSRF-TOKEN dari cookie (dibutuhkan Sanctum SPA).
const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  withXSRFToken: true,
})

// Toko aktif (Cara B): backend memvalidasi keanggotaan user terhadap header ini —
// semua baca/tulis data toko mengikuti pilihan switcher di header.
api.interceptors.request.use((config) => {
  const storeId = localStorage.getItem('activeStoreId')
  if (storeId) config.headers['X-Store-Id'] = storeId
  return config
})

export default api
