# Setup de Storage e Edge Functions

## 1. Buckets de Storage

Os buckets abaixo precisam ser criados manualmente no painel do Supabase.

### company-logos
1. Acesse **Supabase → Storage → New bucket**
2. Nome: `company-logos`
3. Marque **Public bucket: true**
4. Clique em **Create bucket**

### user-avatars
1. Acesse **Supabase → Storage → New bucket**
2. Nome: `user-avatars`
3. Marque **Public bucket: true**
4. Clique em **Create bucket**

### Policies de Storage (rodar no SQL Editor)

```sql
-- company-logos: qualquer usuário autenticado pode fazer upload e leitura
create policy "Authenticated upload company-logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos');

create policy "Public read company-logos"
  on storage.objects for select to public
  using (bucket_id = 'company-logos');

-- user-avatars
create policy "Authenticated upload user-avatars"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'user-avatars');

create policy "Public read user-avatars"
  on storage.objects for select to public
  using (bucket_id = 'user-avatars');
```

---

## 2. Edge Function: create-user

A Edge Function está em `supabase/functions/create-user/index.ts`.

### Pré-requisitos

1. Instale a Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Faça login:
   ```bash
   supabase login
   ```

3. Vincule ao projeto:
   ```bash
   supabase link --project-ref SEU_PROJECT_REF
   ```
   > O `project-ref` está na URL do Supabase: `https://app.supabase.com/project/SEU_PROJECT_REF`

### Deploy

```bash
supabase functions deploy create-user
```

### Variáveis de Ambiente

A função usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que são injetadas automaticamente pelo runtime do Supabase em Edge Functions — **não é necessário configurar manualmente**.

### Teste

```bash
curl -X POST https://SEU_PROJECT_REF.supabase.co/functions/v1/create-user \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"senha123","role":"csm"}'
```

---

## 3. Variáveis de Ambiente (Vercel)

Confirme que as seguintes variáveis estão configuradas em **Vercel → Settings → Environment Variables**:

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/public do Supabase |

> A `SERVICE_ROLE_KEY` **nunca deve ir para o frontend** — ela só é usada na Edge Function server-side.
