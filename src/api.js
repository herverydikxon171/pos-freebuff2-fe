import axios from 'axios'

// withXSRFToken: kirim X-XSRF-TOKEN dari cookie (dibutuhkan Sanctum SPA).
const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  withXSRFToken: true,
})

export default api
