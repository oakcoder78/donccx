/**
 * Formats a phone number string with Brazilian mask.
 * Stores digits only; displays formatted.
 *
 * 11 digits → (XX) XXXXX-XXXX (celular)
 * 10 digits → (XX) XXXX-XXXX  (fixo)
 * other     → original value
 * null/undefined/'' → ''
 */
export function formatPhone(number) {
  if (!number && number !== 0) return ''
  const digits = String(number).replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  }
  return String(number)
}

/**
 * Strips a formatted phone string down to digits only.
 * Use this before saving to the database.
 */
export function stripPhone(number) {
  if (!number) return ''
  return String(number).replace(/\D/g, '')
}

/**
 * Applies the mask progressively as the user types.
 * Returns the masked string. The underlying stored value should use stripPhone().
 */
export function maskPhoneInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2)  return digits.length ? `(${digits}` : ''
  if (digits.length <= 6)  return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
}
