// Shared validation/normalization for the optional external support URL
// stored per question in the brief structure JSONB (`support_url`).

const MAX_LENGTH = 2000

// Returns { valid, url, hostname, error }.
// `url` is the normalized value (https only, no credentials), `hostname` for display.
// Empty input is valid and yields `url: null` (field is optional).
export function normalizeSupportUrl(raw) {
  const value = String(raw ?? '').trim()

  if (!value) return { valid: true, url: null, hostname: null }

  if (value.length > MAX_LENGTH) {
    return { valid: false, url: null, hostname: null, error: 'O endereço é muito longo. Use uma URL pública mais curta.' }
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return { valid: false, url: null, hostname: null, error: 'Informe uma URL completa, começando por https://' }
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, url: null, hostname: null, error: 'Por segurança, use apenas endereços HTTPS públicos.' }
  }

  if (parsed.username || parsed.password) {
    return { valid: false, url: null, hostname: null, error: 'URLs com usuário ou senha embutidos não são permitidas.' }
  }

  if (!parsed.hostname) {
    return { valid: false, url: null, hostname: null, error: 'Informe uma URL completa, começando por https://' }
  }

  return { valid: true, url: parsed.href, hostname: parsed.hostname }
}
