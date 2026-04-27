# Integration Points

Este documento enumera os pontos de integração externa presentes na aplicação, indicando onde cada integração ocorre e quais módulos dependem dela.

## Supabase

- **Sistema externo:** Supabase (PostgreSQL + Auth + Storage).
- **Propósito:** Banco de dados principal onde são armazenadas as entidades do domínio – clientes, projetos, atividades, contatos e dados relacionados à autenticação.
- **Módulos dependentes:** Hooks como `useClients`, `useProjects`, `useActivities`, `useContacts`, `useSegments` e `useStages`, que utilizam o `supabaseClient` diretamente ou funções da camada `services`.
- **Local da comunicação:** Centralizada no cliente Supabase definido em `src/lib/supabaseClient.js`. Os hooks utilizam este cliente diretamente ou indiretamente através da camada `services`.

---

## Freshdesk

- **Sistema externo:** Freshdesk – plataforma de suporte e gerenciamento de tickets.
- **Propósito:** Sincronizar dados de tickets e eventos de suporte com o sistema, permitindo que informações operacionais sejam utilizadas em análises, relatórios e acompanhamento de clientes.
- **Módulos dependentes:** Funções auxiliares presentes na camada `lib`, como `freshdeskSync.js` e `freshdeskConfig.js`, além de hooks e componentes que exibem ou utilizam dados provenientes do Freshdesk.
- **Local da comunicação:** Implementada através de funções utilitárias localizadas em `src/lib/freshdeskSync.js` e `src/lib/freshdeskConfig.js`, que executam chamadas HTTP para a API do Freshdesk.

---

## Donc API

- **Sistema externo:** API externa da plataforma Donc, utilizada para integração com sistemas parceiros.
- **Propósito:** Permitir comunicação com serviços externos relacionados à operação, como sincronização de dados ou consulta de informações externas.
- **Módulos dependentes:** Componentes e hooks que necessitam acessar dados externos configurados através do módulo Settings.
- **Local da comunicação:** Implementada através de funções utilitárias localizadas na camada `lib`, configuradas via módulo Settings e utilizadas por hooks ou componentes que dependem de dados externos.

---

## OpenRouter (Donkie)

- **Sistema externo:** OpenRouter – serviço de IA que fornece modelos de linguagem (ChatGPT, Claude, etc.).
- **Propósito:** Alimentar funcionalidades assistidas, geração de texto e automação inteligente dentro da aplicação.
- **Módulos dependentes:** O sub‑módulo *Donkie* (`src/donkie/`) contém wrappers que chamam a API OpenRouter; alguns *services* que necessitam de respostas IA e *hooks* que gerenciam o estado da chamada.
- **Local da comunicação:** Implementado em `src/lib/openrouterService.js` (ou similar) dentro da camada *Donkie*; os serviços de IA importam esse cliente.

---

## File Storage (Attachments)

- **Sistema externo:** Supabase Storage (ou bucket configurado para armazenamento de arquivos).
- **Propósito:** Armazenar arquivos anexados a atividades, como documentos, imagens e evidências operacionais.
- **Módulos dependentes:** Serviços localizados em `src/services/activityAttachments/`, utilizados por hooks e componentes responsáveis por exibir, criar ou remover anexos em atividades.
- **Local da comunicação:** Implementada através da camada `services/activityAttachments/`, que utiliza o `supabaseClient` para realizar upload, download e remoção de arquivos armazenados.
---

**Resumo:** As integrações externas são centralizadas nas camadas `lib`, `services` e `hooks`, com configurações globais armazenadas em *settings*. Cada ponto de integração tem um propósito bem definido e fornece dados ou funcionalidades que são consumidas por diferentes partes da aplicação, garantindo um fluxo de dados coerente e desacoplado.
