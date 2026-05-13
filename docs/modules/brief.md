# Módulo Brief de Discovery

## Propósito

Questionário de discovery vinculado a uma fase de onboarding. O CSM cria uma instância a partir de um template JSONB, gera um link público e envia ao cliente. O cliente preenche via link autenticado por e-mail (mesmo padrão do RMC). Respostas ficam armazenadas e visíveis ao CSM dentro do `OnboardingDetailPage`.

---

## Tabelas e Relações

```
brief_templates (uuid PK)
    └── brief_instances (uuid PK)
            ├── client_id  → clients.id (integer)
            ├── fase_id    → onboarding_fases.id (integer)
            ├── template_id → brief_templates.id (uuid, nullable)
            ├── brief_responses (uuid PK)
            │       └── instance_id → brief_instances.id
            └── brief_attachments (uuid PK)
                    └── instance_id → brief_instances.id
```

### brief_templates
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| name | text | Nome do template |
| operation_type | text | `entrega \| instalacao \| assistencia \| seguranca` |
| structure | jsonb | Seções e perguntas (ver schema abaixo) |
| is_active | boolean | Oculta do seletor quando false |
| created_by | uuid | FK → profiles |

### brief_instances
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| client_id | integer | FK → clients |
| fase_id | integer | FK → onboarding_fases |
| template_id | uuid | FK → brief_templates (nullable — template pode ser excluído) |
| structure_snapshot | jsonb | Cópia congelada do template na criação |
| status | text | `draft \| sent \| in_progress \| completed \| archived` |
| access_token | uuid | Token de acesso público único |
| public_expires_at | timestamptz | Expiração do link (null = sem expiração) |
| sent_at / completed_at | timestamptz | Timestamps de ciclo de vida |

### brief_responses
Uma linha por pergunta respondida. `question_id` referencia o `id` dentro do JSONB de `structure_snapshot`.

### brief_attachments
Arquivos opcionais por pergunta ou pelo brief geral (`question_id null`). Bucket: `project-briefs`, path: `{instance_id}/{filename}`.

---

## Schema JSONB do Template

```json
{
  "sections": [
    {
      "id": "string",
      "order": 1,
      "title": "Nome da Seção",
      "deliverable": "O que será entregue nesta seção",
      "callout": "Aviso ou nota especial (opcional)",
      "audience": "Para quem esta seção se destina",
      "questions": [
        {
          "id": "q1",
          "order": 1,
          "text": "Texto da pergunta",
          "type": "text | textarea | select | multiselect | date | boolean",
          "required": true,
          "note": "Nota de ajuda ao respondente (opcional)",
          "allow_attachment": false
        }
      ]
    }
  ]
}
```

`structure_snapshot` em `brief_instances` é uma cópia deste schema no momento da criação — preserva o conteúdo do brief mesmo se o template for editado ou excluído posteriormente.

---

## Fluxo Operacional

```
CSM seleciona template
    → cria brief_instance (status: draft)
    → copia structure → structure_snapshot
    → gera access_token único
    → define public_expires_at (opcional)
    → status: sent → envia link /brief/{access_token} ao cliente

Cliente abre link público
    → informa e-mail
    → edge fn brief-public valida token + e-mail contra contacts do cliente
    → retorna structure_snapshot + respostas existentes

Cliente preenche
    → save_response por pergunta (upsert)
    → status muda para in_progress na primeira escrita

Cliente finaliza
    → action: complete
    → status: completed + completed_at
    → atividade registrada no cliente (activity_type: 'brief')

CSM visualiza dentro de OnboardingDetailPage
    → lê brief_instances filtrado por fase_id
    → lê brief_responses + brief_attachments
```

---

## URL Pública e Autenticação por E-mail

- URL: `/brief/{access_token}`
- Sem JWT do Supabase — edge function `brief-public` roda com `verify_jwt = false`
- Autenticação: e-mail validado contra `contacts` do cliente dono da instância
- Sem e-mail na tabela `contacts` → acesso negado (403)
- Token expirado ou instância arquivada → acesso negado (403)

### Actions da edge function `brief-public`

| Action | Descrição |
|---|---|
| `validate` | Valida token + e-mail, retorna metadados e structure_snapshot |
| `get` | Retorna instância + respostas + anexos existentes |
| `save_response` | Upsert de resposta por question_id |
| `complete` | Marca completed, registra atividade |

---

## RLS

| Tabela | Regra |
|---|---|
| brief_templates | Todos leem; apenas admin/manager criam e editam |
| brief_instances | CSM vê só clientes próprios; admin/manager vê tudo |
| brief_responses | Acesso via instância → cliente → CSM ou admin/manager |
| brief_attachments | Idem brief_responses |

Storage bucket `project-briefs`: privado, qualquer usuário autenticado lê e insere (filtrado por RLS da instância no lado da aplicação).

---

## Página Pública — BriefPublicPage

`src/pages/BriefPublicPage.jsx` — rota `/brief/:token`

Rota pública sem ProtectedRoute nem AuthProvider. Segue mesmo padrão visual do RMC (`ReportPublicPage.jsx`): inline styles, sem Tailwind, Google Fonts Poppins via `<link>`.

### Fases de renderização

| Fase | Descrição |
|---|---|
| `auth` | Formulário de e-mail. Botão "Acessar Brief" chama `validate`. |
| `validating` | Spinner enquanto edge fn valida. |
| `loading` | Chama `get` para carregar respostas existentes. |
| `form` | Layout: header fixo + sidebar (260px) + área principal + footer fixo. |
| `thanks` | Tela de confirmação após `complete`. |
| `error` | Mensagem de erro com botão para tentar novamente. |

### Sessão

Chave `brief_session_{token}` em sessionStorage. Armazena `{ email, instance_id, clientName }`. Ao reabrir aba: email preenchido automaticamente, pulando tela de auth se validação OK.

### Auto-save

Debounce de 1500ms por `question_id` via `useRef`. Chama `save_response` silenciosamente. Feedback via indicador "Salvando…" no footer.

### Sidebar

Lista seções com ícone de progresso inline (SVG):
- `IcoCheck` (círculo verde) — todas perguntas obrigatórias respondidas
- `IcoHalf` (círculo amarelo) — pelo menos uma resposta
- `IcoEmpty` (círculo cinza) — sem respostas

### Bloqueio pós-conclusão

`instance.status === 'completed'` → campos `readOnly`, banner "Brief concluído em {data}", footer oculto.

### callBrief helper

```js
const BASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callBrief(payload) {
  const res = await fetch(`${BASE_URL}/functions/v1/brief-public`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!res.ok) throw { status: res.status, message: json.error || 'Erro desconhecido' }
  return json
}
```

---

## Ícones (icons.js)

```js
import { Icons } from '@/lib/icons'

Icons.ClipboardList  // feed de atividades
Icons.FileQuestion   // seletor de template
Icons.Send           // botão de envio do link
```

---

## Migration

`supabase/migrations/20260513000000_project_brief.sql`

## Edge Function

`supabase/functions/brief-public/index.ts`

> **Após deploy:** desabilitar "Verify JWT" em Dashboard → Edge Functions → brief-public → Settings.
