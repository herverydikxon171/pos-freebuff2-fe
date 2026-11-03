// Input uang: pemisah ribuan id-ID (titik) tampil selama diketik;
// model selalu menyimpan digit polos supaya Number() di mana pun tetap aman.
export function moneyFmt(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits).toLocaleString('id-ID') : ''
}

export function onMoney(e, set) {
  const digits = e.target.value.replace(/\D/g, '')
  set(digits)
  e.target.value = moneyFmt(digits)
}
