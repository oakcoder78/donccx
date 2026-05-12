/**
 * scripts/google-calendar-event.ts
 *
 * Prototype: Google Calendar event creation via OAuth2 + fetch.
 * Uses client_secret JSON directly — no heavy deps.
 *
 * Prereqs:
 *   1. Generate client_secret.json from Google Cloud Console
 *      (OAuth2 Web App, add http://localhost:3000 to redirect URIs)
 *   2. Place it next to this script or pass --credentials path
 *   3. npm install -D typescript ts-node @types/node  (or use deno)
 *
 * Auth flow (prototype — manual browser step):
 *   deno run --allow-net --allow-read --allow-env scripts/google-calendar-event.ts authorize
 *   (opens browser → user authorizes → copies code → script exchanges)
 *
 * Create event:
 *   deno run --allow-net --allow-read --allow-env scripts/google-calendar-event.ts create \
 *     --title "Reunião de Kickoff" \
 *     --start "2025-06-01T10:00:00-03:00" \
 *     --end "2025-06-01T11:00:00-03:00" \
 *     --attendees "user@example.com" \
 *     --desc "Kickoff do projeto XYZ"
 *
 * Run locally with Node/tsx too:
 *   npx tsx scripts/google-calendar-event.ts create --title "..."
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const CREDENTIALS_PATH = resolve(__dir, '../client_secret_*.json')
const TOKENS_FILE = resolve(__dir, '../.google_tokens.json')
const REDIRECT_URI = 'http://localhost:3000'

// ── Load credentials ──────────────────────────────────────────────────────────
function loadCredentials(): { clientId: string; clientSecret: string; redirectUris: string[] } {
  const files = existsSync(CREDENTIALS_PATH.replace('*', ''))
    ? [CREDENTIALS_PATH.replace('*', '')]
    : []
  const glob = (globalThis as Record<string, unknown>).__lscache?.CREDENTIALS_PATH || CREDENTIALS_PATH

  let clientId = process.env.GOOGLE_CLIENT_ID
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    try {
      const { readdirSync } = await import('fs') as unknown as { readdirSync: (p: string) => string[] }
      const files = readdirSync(__dir).filter(f => f.startsWith('client_secret') && f.endsWith('.json'))
      if (files.length === 0) throw new Error('No client_secret JSON found')
      const cred = JSON.parse(readFileSync(resolve(__dir, '..', files[0]), 'utf-8'))
      clientId = cred.web?.client_id
      clientSecret = cred.web?.client_secret
    } catch {
      // ignore — try env vars set above
    }
  }

  if (!clientId || !clientSecret) {
    console.error('Erro: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não encontrados.')
    console.error('Define as env vars ou coloca client_secret JSON no raiz.')
    Deno.exit(1)
  }

  return { clientId, clientSecret, redirectUris: [REDIRECT_URI] }
}

// ── OAuth2 helpers ────────────────────────────────────────────────────────────
function getAuthUrl(clientId: string, redirectUri: string): string {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/auth?${params}`
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  const data = await res.json() as GoogleTokenResponse
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`)

  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? '',
    expiryDate: Date.now() + (data.expires_in ?? 0) * 1000,
  }
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; newRefreshToken?: string; expiryDate: number }> {
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

  const data = await res.json() as GoogleTokenResponse
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)

  return {
    accessToken: data.access_token!,
    newRefreshToken: data.refresh_token,
    expiryDate: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
}

// ── Token storage ────────────────────────────────────────────────────────────
interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiryDate: number
}

function saveTokens(tokens: GoogleTokens): void {
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2))
  console.log(`Tokens salvos em ${TOKENS_FILE}`)
}

function loadTokens(): GoogleTokens | null {
  if (!existsSync(TOKENS_FILE)) return null
  return JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'))
}

// ── Google Calendar API ───────────────────────────────────────────────────────
interface CalendarEvent {
  summary: string
  description?: string
  start: string
  end: string
  attendees?: { email: string }[]
  reminders?: { useDefault: boolean; overrides: { method: string; minutes: number }[] }
  location?: string
  colorId?: string
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function createCalendarEvent(
  accessToken: string,
  event: CalendarEvent,
  calendarId = 'primary',
): Promise<{ id: string; htmlLink: string; summary: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  )

  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`Calendar API error: ${res.status} — ${JSON.stringify(data)}`)

  return {
    id: data.id as string,
    htmlLink: data.htmlLink as string,
    summary: data.summary as string,
  }
}

// ── CLI commands ───────────────────────────────────────────────────────────────
async function cmdAuthorize(): Promise<void> {
  const { clientId, clientSecret } = loadCredentials()
  const url = getAuthUrl(clientId, REDIRECT_URI)

  console.log('Abre este URL no browser e autoriza:\n')
  console.log(url)
  console.log('\nDepois cola o código aqui:')

  const code = (await prompt('Código: ')).trim()
  if (!code) { console.error('Código vazio.'); Deno.exit(1) }

  const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, REDIRECT_URI)
  saveTokens(tokens)
  console.log('Autorização completa! Tokens guardados.')
}

async function cmdCreate(args: CreateArgs): Promise<void> {
  const { clientId, clientSecret } = loadCredentials()
  const tokens = loadTokens()

  if (!tokens?.refreshToken) {
    console.error('Tokens não encontrados. Corre: deno run scripts/google-calendar-event.ts authorize')
    Deno.exit(1)
  }

  let accessToken = tokens.accessToken
  if (tokens.expiryDate < Date.now()) {
    console.log('Token expirou. A fazer refresh...')
    const refreshed = await refreshAccessToken(clientId, clientSecret, tokens.refreshToken)
    accessToken = refreshed.accessToken
    if (refreshed.newRefreshToken || refreshed.expiryDate) {
      saveTokens({
        accessToken,
        refreshToken: refreshed.newRefreshToken ?? tokens.refreshToken,
        expiryDate: refreshed.expiryDate,
      })
    }
  }

  const event: CalendarEvent = {
    summary: args.title,
    description: args.desc,
    location: args.location,
    start: { dateTime: args.start, timeZone: 'America/Sao_Paulo' } as unknown as string,
    end: { dateTime: args.end, timeZone: 'America/Sao_Paulo' } as unknown as string,
    attendees: args.attendees?.map(email => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  }

  const result = await createCalendarEvent(accessToken, event)
  console.log('Evento criado com sucesso!')
  console.log(`ID:     ${result.id}`)
  console.log(`Link:   ${result.htmlLink}`)
}

async function prompt(msg: string): Promise<string> {
  const buf = new Uint8Array(1024)
  Deno.stdout.writeSync(new TextEncoder().encode(msg))
  const n = await Deno.stdin.read(buf)
  return new TextDecoder().decode(buf.subarray(0, n)).trim()
}

interface CreateArgs {
  title: string
  start: string
  end: string
  desc?: string
  location?: string
  attendees?: string[]
}

function parseArgs(): { cmd: string; args: Record<string, string | string[]> } {
  const cmd = Deno.args[0] ?? 'create'
  const args: Record<string, string | string[]> = {}
  for (let i = 1; i < Deno.args.length; i++) {
    const key = Deno.args[i].replace(/^--/, '')
    if (Deno.args[i + 1]?.startsWith('--')) { args[key] = 'true'; continue }
    if (i + 1 < Deno.args.length) {
      const val = Deno.args[++i]
      args[key] = val.startsWith('[') ? JSON.parse(val) : val
    } else {
      args[key] = 'true'
    }
  }
  return { cmd, args }
}

// ── Entry point ────────────────────────────────────────────────────────────────
const { cmd, args } = parseArgs()

if (cmd === 'authorize') {
  await cmdAuthorize()
} else if (cmd === 'create') {
  const createArgs: CreateArgs = {
    title: String(args.title ?? 'Evento doncCX Hub'),
    start: String(args.start ?? new Date(Date.now() + 86400000).toISOString()),
    end: String(args.end ?? new Date(Date.now() + 90000000).toISOString()),
    desc: args.desc ? String(args.desc) : undefined,
    location: args.location ? String(args.location) : undefined,
    attendees: Array.isArray(args.attendees) ? args.attendees.map(String) : args.attendees ? [String(args.attendees)] : undefined,
  }
  await cmdCreate(createArgs)
} else {
  console.error(`Comando desconhecido: ${cmd}`)
  console.error('Uso: google-calendar-event.ts [authorize|create]')
  Deno.exit(1)
}
