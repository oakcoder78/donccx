/**
 * scripts/google-calendar-event.mjs
 *
 * Prototype Node.js/ESM: Google Calendar event creation via OAuth2 + fetch.
 * Usa client_secret JSON do raiz. Executa com:  node scripts/google-calendar-event.mjs
 *
 * Usage:
 *   node scripts/google-calendar-event.mjs authorize
 *   node scripts/google-calendar-event.mjs create --title "Kickoff" --start "2025-06-01T10:00:00-03:00" --end "2025-06-01T11:00:00-03:00"
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdir } from 'fs/promises'

const __dir = dirname(fileURLToPath(import.meta.url))
const TOKENS_FILE = resolve(__dir, '../.google_tokens.json')
const REDIRECT_URI = 'http://localhost:3000'

function loadCredentials() {
  let clientId = process.env.GOOGLE_CLIENT_ID
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    const files = readdirSync(resolve(__dir, '..')).filter(f => f.startsWith('client_secret') && f.endsWith('.json'))
    if (files.length === 0) throw new Error('No client_secret JSON found')
    const cred = JSON.parse(readFileSync(resolve(__dir, '..', files[0]), 'utf-8'))
    clientId = cred.web?.client_id
    clientSecret = cred.web?.client_secret
  }

  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET')
  return { clientId, clientSecret }
}

function getAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/auth?${params}`
}

async function exchangeCode(code, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiryDate: Date.now() + (data.expires_in ?? 0) * 1000,
  }
}

async function refreshToken(refreshToken, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  return {
    accessToken: data.access_token,
    newRefreshToken: data.refresh_token,
    expiryDate: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
}

function saveTokens(tokens) {
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2))
  console.log(`Tokens saved to ${TOKENS_FILE}`)
}

function loadTokens() {
  if (!existsSync(TOKENS_FILE)) return null
  return JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'))
}

async function createEvent(accessToken, event) {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(`Calendar API: ${res.status} — ${JSON.stringify(data)}`)
  return { id: data.id, htmlLink: data.htmlLink, summary: data.summary }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const [cmd, ...rawArgs] = process.argv.slice(2)

async function main() {
  const { clientId, clientSecret } = loadCredentials()

  if (cmd === 'authorize') {
    const url = getAuthUrl(clientId, REDIRECT_URI)
    console.log('Open this URL and authorize:\n', url, '\nPaste the code here: ')
    const code = await question('Code: ')
    const tokens = await exchangeCode(code, clientId, clientSecret)
    saveTokens(tokens)
    console.log('Done. Tokens saved.')
    return
  }

  if (cmd === 'create') {
    const tokens = loadTokens()
    if (!tokens?.refreshToken) throw new Error('Run "authorize" first')

    let accessToken = tokens.accessToken
    if (tokens.expiryDate < Date.now()) {
      console.log('Token expired. Refreshing...')
      const refreshed = await refreshToken(tokens.refreshToken, clientId, clientSecret)
      accessToken = refreshed.accessToken
      saveTokens({ accessToken, refreshToken: refreshed.newRefreshToken ?? tokens.refreshToken, expiryDate: refreshed.expiryDate })
    }

    const args = Object.fromEntries(rawArgs.filter(a => a.startsWith('--')).map(a => [a.slice(2).split('=')[0], a.includes('=') ? a.split('=').slice(1).join('=') : true]))

    const start = args.start ? new Date(args.start).toISOString() : new Date(Date.now() + 86400000).toISOString()
    const end   = args.end   ? new Date(args.end).toISOString()   : new Date(Date.now() + 90000000).toISOString()

    const event = {
      summary: args.title || 'doncCX Hub Event',
      description: args.desc || undefined,
      location: args.location || undefined,
      start: { dateTime: start, timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: end,   timeZone: 'America/Sao_Paulo' },
      attendees: args.attendee ? [{ email: args.attendee }] : undefined,
      reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 15 }] },
    }

    const result = await createEvent(accessToken, event)
    console.log('Event created!')
    console.log(`ID:   ${result.id}`)
    console.log(`Link: ${result.htmlLink}`)
    return
  }

  console.error('Usage: node google-calendar-event.mjs [authorize|create]')
}

function question(msg) {
  return new Promise(resolve => {
    process.stdout.write(msg)
    process.stdin.once('data', d => resolve(d.toString().trim()))
  })
}

main().catch(err => { console.error(err.message); process.exit(1) })
