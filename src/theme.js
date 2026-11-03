export const THEMES = [
  { id: 'light', label: 'Terang', icon: '☀️' },
  { id: 'dark', label: 'Gelap', icon: '🌙' },
  { id: 'brand', label: 'Brand', icon: '🎨' },
]

const STORAGE_KEY = 'pos-theme'

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY)
  const theme = THEMES.some((t) => t.id === saved) ? saved : 'light'
  document.documentElement.dataset.theme = theme
}

export function setTheme(id) {
  document.documentElement.dataset.theme = id
  localStorage.setItem(STORAGE_KEY, id)
}
