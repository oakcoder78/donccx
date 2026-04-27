# Deployment Context

Descrição do ambiente onde a aplicação opera e como os recursos de infraestrutura se interconectam.

---

## Frontend

- **Tecnologia:** Aplicação React 18 construída com Vite.
- **Execução:** Código JavaScript/HTML/CSS roda no navegador do usuário.
- **Build:** `npm run build` gera assets estáticos (JS, CSS, assets) que são servidos por um CDN ou plataforma cloud.
- **Hospedagem:** Deploy típico em Vercel (ou outra plataforma estática), onde o bundle é servido como um site SPA.
- **Função:** Responsável por toda a UI, lógica de interação, gerenciamento de estado local e disparo de chamadas a APIs externas.

---

## Backend (BaaS)

- **Plataforma:** Supabase fornece Backend‑as‑a‑Service.
- **Responsabilidades:** Autenticação (Auth), API REST auto‑gerada, Realtime, funções Edge.
- **Operações CRUD:** Todas as operações de criação, leitura, atualização e exclusão de entidades (clientes, projetos, atividades, contatos, etc.) são realizadas através do cliente Supabase.
- **Sessão:** Supabase gerencia sessões de usuário via JWT; o frontend inclui o token nas requisições.
- **Observação:** Não há um backend Node/Express próprio; a lógica de negócios que exige custom code reside em funções Edge ou na camada `services` do frontend.

---

## Database

- **Tipo:** PostgreSQL gerenciado pelo Supabase.
- **Entidades:**
  - `clients`
  - `projects`
  - `activities`
  - `contacts`
  - `settings`
  - `health_data`
- **Uso:** Armazenamento persistente das informações de domínio. As migrações são versionadas em `supabase/migrations` e aplicadas via `supabase db push`.

---

## File Storage

- **Serviço:** Supabase Storage (bucket configurado).
- **Propósito:** Guardar arquivos anexos enviados pelos usuários, como documentos ou imagens vinculados a atividades.
- **Camada de acesso:** Implementada através da pasta `src/services/activityAttachments/`, que utiliza o cliente Supabase para upload, download e remoção de arquivos.

---

## External Services

- **Freshdesk:** Sistema de suporte. Integração realizada através dos módulos `src/lib/freshdeskSync.js` e `src/lib/freshdeskConfig.js`, responsáveis pela comunicação com a API do Freshdesk e sincronização de dados.
- **Donc API:** API externa que fornece dados operacionais de parceiros. Configurada através do módulo Settings e acessada por funções utilitárias localizadas na camada `lib`.
- **OpenRouter (Donkie):** Serviço de IA que fornece modelos de linguagem. Implementado através do módulo `src/lib/openrouterService.js`, utilizado por componentes e serviços que executam funcionalidades assistidas.

---

## Environment Configuration

- **Armazenamento:** Variáveis definidas em `.env.local` (ou `.env`).
- **Principais variáveis:**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FRESHDESK_API_KEY`
  - `FRESHDESK_DOMAIN`
  - `DONC_API_URL`
  - `OPENROUTER_API_KEY`
- **Uso:** As variáveis são lidas pelo cliente Supabase e pelos módulos `lib` que realizam chamadas a serviços externos. Falta de qualquer variável causa falha na inicialização.

---

## Summary

A arquitetura segue o fluxo:

```
Frontend (React) → Supabase (Auth, DB, Storage) → External APIs (Freshdesk, Donc, OpenRouter)
```

- O frontend consome diretamente o Supabase via `supabaseClient`.
- Serviços externos são acessados por meio das camadas `lib` e `services`, mantendo a UI desacoplada das integrações.
- Configurações sensíveis são gerenciadas por variáveis de ambiente, garantindo que a mesma base de código funcione em ambientes de desenvolvimento, teste e produção.
