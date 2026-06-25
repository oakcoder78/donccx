// Shared auth utilities for Edge Functions.
// Server-to-server callers (n8n/VPS, pg_cron, internal function calls) authenticate
// with the dedicated SYNC_WEBHOOK_SECRET sent in the `x-webhook-secret` header.
// Browser callers authenticate with a user JWT validated via auth.getUser + profile role.
// No manual JWT decoding is allowed anywhere: payload claims are attacker-controlled
// unless the signature is verified.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Returns the secret key used to create the admin client.
 * Prefers the new sb_secret_* keys (SUPABASE_SECRET_KEYS is a JSON object keyed by
 * key name, injected by the platform) and falls back to the legacy service_role JWT
 * so functions keep working before and after the legacy keys are disabled.
 */
export function getServiceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? 'null')
    if (keys && typeof keys === 'object') {
      // 'donccxhub' is the active secret key; 'default' was rotated out (potentially
      // exposed). Fall back to whatever single secret key exists if neither name matches.
      const candidate = keys['donccxhub'] ?? Object.values(keys)[0]
      if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
  } catch (_) {
    // fall through to legacy key (only reachable if SUPABASE_SECRET_KEYS is absent)
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
}

/** Constant-time string comparison (compares SHA-256 digests to avoid length leaks). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const va = new Uint8Array(da)
  const vb = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

export interface AuthResult {
  authorized: boolean
  /** 'server' when authenticated via webhook secret, 'user' via JWT. */
  via?: 'server' | 'user'
  userId?: string
}

/**
 * Authorizes a request either as a trusted server (x-webhook-secret matching
 * SYNC_WEBHOOK_SECRET) or as a signed-in user whose profiles.role is in allowedRoles.
 */
export function createCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    'https://donccx.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ]
  const base = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (!origin) {
    return { ...base, 'Access-Control-Allow-Origin': 'https://donccx.vercel.app' }
  }
  const isVercelPreview = /^https:\/\/[a-zA-Z0-9-]+-donccx\.vercel\.app$/.test(origin)
  if (allowedOrigins.includes(origin) || isVercelPreview) {
    return { ...base, 'Access-Control-Allow-Origin': origin }
  }
  return { ...base, 'Access-Control-Allow-Origin': 'https://donccx.vercel.app' }
}

/** In-memory rate limiter for Edge Functions (per warm instance). */
export function createRateLimiter(windowMs: number, maxRequests: number) {
  const map = new Map<string, { count: number; resetAt: number }>()
  return function checkRateLimit(key: string): boolean {
    const now = Date.now()
    const entry = map.get(key)
    if (!entry || now > entry.resetAt) {
      map.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (entry.count >= maxRequests) return false
    entry.count++
    return true
  }
}

export async function authorizeRequest(
  req: Request,
  admin: SupabaseClient,
  allowedRoles: string[],
): Promise<AuthResult> {
  const webhookSecret = Deno.env.get('SYNC_WEBHOOK_SECRET') ?? ''
  const providedSecret = req.headers.get('x-webhook-secret') ?? ''
  if (webhookSecret && providedSecret && await timingSafeEqual(providedSecret, webhookSecret)) {
    return { authorized: true, via: 'server' }
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { authorized: false }

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { authorized: false }

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (allowedRoles.includes(profile?.role ?? '')) {
    return { authorized: true, via: 'user', userId: user.id }
  }
  return { authorized: false }
}
