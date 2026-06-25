## Description

<!-- Briefly describe what this PR does and why -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no functional change)
- [ ] Infrastructure / CI / tooling
- [ ] Documentation

## Security Checklist

- [ ] New Edge Function includes JWT/caller verification
- [ ] New table has RLS enabled and at least one policy
- [ ] No secrets or tokens in code (use `Deno.env.get`)
- [ ] CORS restricted to known origins (use `createCorsHeaders`)
- [ ] Error messages do not leak internals (`e.message` → generic)
- [ ] Input is validated (type, length, format)

## Migration

- [ ] No migration needed
- [ ] Migration included (file: `supabase/migrations/...`)
