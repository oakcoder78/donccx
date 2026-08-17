# SDD — Freshdesk Operations Center

## Purpose

Este SDD define a reorganização da integração Freshdesk em um **Centro Operacional Freshdesk** dentro do doncCX Hub.

O objetivo é manter as capacidades existentes, mas substituir a experiência fragmentada de configuração, mapeamento, importação e revisão por uma jornada operacional única, explícita e auditável:

```text
Verificar integração → Validar mapeamentos → Importar período → Revisar → Publicar → Acompanhar histórico
```

O Freshdesk continua sendo a fonte dos fatos operacionais de suporte. O doncCX continua sendo o CRM mestre de clientes, instâncias e relacionamentos de Customer Success.

### How to use this document

Leia primeiro a Seção 0 para entender o estado real do sistema e o escopo aprovado. Depois consulte as decisões de negócio, os contratos de dados e as fases de implementação. Não implemente o modelo futuro sem validar as decisões em aberto da Seção 13.

Este documento descreve o estado desejado e serve como contrato para implementação incremental. Não autoriza remoção de dados legados por si só.

## 0. Current System State

**Lifecycle:** Draft

**Branch:** `main`

**Latest relevant commits:**

- `30b0f41` — proteção e reconciliação de IDs SaaS legados.
- `cec0f60` — item `TD-007` para investigar `oak-donc-reports`.

**Production facts:**

- A aba atual está em `src/components/settings/SettingsFreshdesk.jsx`.
- O acesso publicado exige autenticação; a rota pública redireciona para login sem sessão.
- O Freshdesk usa secrets server-side (`FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`); a tela não configura credenciais diretamente.
- A sincronização manual usa `src/lib/freshdeskSync.js`.
- A sincronização mensal usa `supabase/functions/monthly-sync/index.ts`.
- A revisão usa `src/pages/FreshdeskPendingPage.jsx`.
- O status/agendamento global usa `src/components/settings/SettingsSyncStatus.jsx`.
- O n8n envia relatórios operacionais para `operational-report-sync`, mas os workflows e o serviço `oak-donc-reports` ficam fora deste repositório.

**Already shipped protections:**

- `client_id_reconciliation` registra seis relações de legado para cliente canônico.
- `client_donc_instances.contrato_saas_id` é positivo e único globalmente.
- `operational-report-sync` rejeita `saas_id` inválido, período inválido e mapeamento ambíguo.
- Nenhum registro legado foi removido.
- Relatórios operacionais conflitantes não foram copiados automaticamente.

### Existing functional gaps

- A tela mistura pré-configuração, mapeamento, importação e revisão.
- `SettingsSyncStatus` está separado da operação Freshdesk.
- A UI atual usa principalmente `clients.freshdesk_company_id` singular.
- `monthly-sync` e os caminhos manuais possuem regras diferentes.
- `client_support` é único por `(client_id, ref_month)` e não possui versionamento de revisão.
- `freshdesk_snapshot` é o staging atual, mas não registra um batch independente.
- A aprovação atual mistura métricas e contatos e pode deixar estado parcial.
- O matching atual de contatos depende principalmente de e-mail e não resolve bem nomes sem e-mail.

### Files to be touched

| File | Change type | Status |
|---|---|---|
| `src/components/settings/SettingsFreshdesk.jsx` | Modify — replace fragmented layout with operations center | Planned |
| `src/components/settings/SettingsSyncStatus.jsx` | Modify — integrate status/history or extract shared operations | Planned |
| `src/pages/FreshdeskPendingPage.jsx` | Modify — independent metric/contact review | Planned |
| `src/lib/freshdeskSync.js` | Modify — canonical sync client or deprecate duplicated rules | Planned |
| `src/lib/freshdeskConfig.js` | Modify — preflight/metadata result contract | Planned |
| `supabase/functions/monthly-sync/index.ts` | Modify — explicit partial/blocked status and canonical execution | Planned |
| `supabase/functions/operational-report-sync/index.ts` | Complete guard already shipped; future observability integration | Partially complete |
| `supabase/functions/freshdesk-proxy/index.ts` | Modify — endpoint/method allowlist and error normalization | Planned |
| `supabase/migrations/` | Create — batches, revisions, mappings and audit as phases require | Planned |
| `docs/system/integration-points.md` | Updated with current identity rule | Complete |
| `docs/backlog.md` | Updated with `TD-007` for `oak-donc-reports` | Complete |

## 1. Product and Domain Definitions

### 1.1 System roles

| System | Role |
|---|---|
| Freshdesk | Fonte operacional de empresas, contatos, tickets e fatos de suporte. |
| doncCX | CRM mestre de clientes, instâncias, relacionamentos e indicadores publicados para CS. |
| `oak-donc-reports` / n8n | Coleta externa, parser de CSVs e envio de dados operacionais para o doncCX. |

### 1.2 Identity model

```text
Cliente comercial doncCX (`clients`)
  ├── Instâncias/contratos Donc (`client_donc_instances`)
  ├── Empresas Freshdesk (`freshdesk_company_id` / future mapping table)
  ├── Contatos (`contacts` + `contact_links`)
  └── Projeções mensais (`client_support`)
```

`contrato_saas_id` identifica um contrato externo da plataforma Donc. Nunca é um `clients.id`.

`client_donc_instances.id` é a chave interna da instância. Uma empresa Freshdesk pode representar o cliente comercial consolidado e, futuramente, ser associada explicitamente a uma instância quando houver necessidade real de separação.

### 1.3 Consolidated versus instance-scoped Freshdesk

O padrão é consolidado:

```text
Freshdesk Company A → cliente comercial doncCX
```

Quando o cliente possuir múltiplos IDs Freshdesk:

1. O sistema bloqueia a importação.
2. O usuário classifica o caso como duplicidade no Freshdesk ou separação intencional.
3. Duplicidade deve ser corrigida no Freshdesk e reduzida a um ID válido.
4. Separação intencional deve associar cada ID à instância Donc correta.
5. Sem classificação, nenhum dado é publicado.

O sistema não deve tentar inferir a instância de um ticket quando o Freshdesk não fornece essa informação.

## 2. Business Rules

### BR-001 — CRM master

O doncCX é a autoridade para clientes, contatos publicados e indicadores consumidos pelo time de CS. O Freshdesk não cria clientes automaticamente no CRM.

### BR-002 — External identifier safety

`saas_id` e `contrato_saas_id` são identificadores externos. Toda resolução deve seguir:

```text
contrato_saas_id → client_donc_instances → client_id canônico
```

Lookup ausente ou ambíguo deve falhar de forma explícita.

### BR-003 — Multiple Freshdesk IDs

Mais de um `freshdesk_company_id` para o mesmo cliente bloqueia a importação até classificação humana.

### BR-004 — Company suggestions

Matching por nome, domínio ou outros atributos gera sugestão. Nenhuma sugestão de empresa altera o vínculo sem confirmação humana.

### BR-005 — Contact matching

Matching de contato gera candidato com evidências. Nome sem e-mail nunca é suficiente para merge automático. O usuário pode confirmar, rejeitar, escolher outro contato, criar novo contato ou manter pendente.

### BR-006 — Independent review

Métricas e contatos possuem decisões independentes. Uma falha na criação/vinculação de contato não pode ser ocultada por uma aprovação de métricas.

### BR-007 — Immutable publication

Uma revisão publicada não é sobrescrita por uma nova importação. Reimportação gera nova revisão e preserva a versão anterior.

### BR-008 — Legacy records

Os seis registros em `client_id_reconciliation` permanecem preservados até auditoria dos dados dependentes. Remoção futura exige validação de referências e migration específica.

### BR-009 — Partial execution

Execução com clientes concluídos e clientes falhos deve ser `partial`, nunca `success` genérico.

### BR-010 — No silent overwrite

Sync, retry ou reimportação não podem reabrir ou substituir silenciosamente dados aprovados.

## 3. Product Scope

### In scope

- Uma seção única **Freshdesk Operations Center** em Configurações.
- Visão geral operacional persistente.
- Pré-voo de conexão, metadados, mapeamentos e bloqueios.
- Mapeamento de empresas Freshdesk com sugestões confirmáveis.
- Importação por período com estado e resultado persistentes.
- Revisão independente de métricas e contatos.
- Histórico de execuções, revisões e decisões.
- Reimportação versionada de períodos aprovados.
- Retry por cliente ou falha quando suportado pelo backend.
- Reconciliação segura dos seis registros legados.

### Out of scope for MVP

- Criar clientes automaticamente a partir do Freshdesk ou `saas_id`.
- Separar automaticamente tickets consolidados por instância.
- Merge probabilístico automático por nome.
- Editar credenciais Freshdesk na UI.
- Resolver definitivamente o código do `oak-donc-reports` na VPS.
- Remover fisicamente os registros legados sem revisão.
- Data warehouse ou ingestão completa de todos os tickets históricos.

## 4. UX Architecture

### 4.1 Information architecture

Uma única seção, com navegação interna por âncoras ou tabs persistentes:

```text
Freshdesk Operations Center
  ├── Overview
  ├── Preflight
  ├── Mapping
  ├── Import
  ├── Review
  └── History
```

Isso não é um wizard obrigatório. Usuários recorrentes podem acessar qualquer etapa, mas ações bloqueadas devem indicar a dependência que falta.

### 4.2 First viewport

O topo deve conter:

- título e explicação orientada à operação;
- status geral da integração;
- última execução e período;
- clientes mapeados;
- bloqueios;
- revisões pendentes;
- ação primária contextual.

Exemplo de estado:

> **Atenção:** conexão válida · 42/58 clientes mapeados · 2 bloqueados · 8 revisões pendentes.

Ação contextual:

- `Verificar integração` quando não configurado;
- `Resolver pendências` quando bloqueado;
- `Iniciar importação` quando pronto;
- `Acompanhar sincronização` quando running;
- `Reprocessar falhas` quando partial/failed.

### 4.3 Preflight

Checklist persistente:

- conexão Freshdesk validada;
- grupos/agentes/campos carregados;
- empresas Freshdesk disponíveis;
- clientes sem vínculo;
- IDs inválidos/duplicados;
- múltiplos IDs aguardando classificação;
- revisão do período já publicada;
- execução concorrente detectada.

Cada check tem `pass`, `warning` ou `blocker`, contagem, evidência e ação.

### 4.4 Mapping

A tabela deve usar o conceito **IDs de empresas Freshdesk**, não um único “Freshdesk ID”.

Colunas desktop:

1. Cliente doncCX.
2. Empresa/empresas Freshdesk.
3. Evidência do match.
4. Confiança.
5. Estado.
6. Ações.

Filtros:

- todos;
- pendentes;
- mapeados;
- sugestão disponível;
- atenção;
- IDs duplicados;
- sem correspondência.

Sugestão deve informar o motivo: `Nome exato`, `Domínio compatível` ou `Nome parcialmente compatível`.

### 4.5 Import

O card de importação mostra antes de executar:

- mês de referência;
- clientes elegíveis;
- clientes bloqueados;
- quantidade estimada;
- revisões existentes;
- consequência da reimportação.

O botão deve ser contextual e explicar bloqueios. Não usar botão desabilitado sem motivo.

Durante execução, mostrar progresso persistente, cliente atual, concluídos, falhos e link para detalhes.

### 4.6 Review

A revisão é uma fila acionável. Métricas e contatos aparecem em painéis independentes.

Para métricas:

- valor atual;
- valor importado;
- delta absoluto e percentual;
- origem e timestamp;
- decisão.

Para contatos:

- nome;
- e-mail;
- telefone;
- candidato DoncCX;
- evidências;
- confiança;
- decisão.

Ações: `Confirmar`, `Rejeitar`, `Corrigir`, `Criar novo`, `Manter pendente`.

### 4.7 History

Histórico deve responder:

- quem executou;
- quando;
- qual mês;
- qual escopo;
- quantos processados;
- quais falharam;
- quais decisões foram tomadas;
- qual revisão está publicada.

## 5. State Model

### 5.1 Integration state

```text
not_configured → configured → connected
                              ├── attention
                              └── failed
```

### 5.2 Run state

```text
scheduled → preflight_running → blocked
                              └── ready → running
                                           ├── partial
                                           ├── failed
                                           └── completed
```

### 5.3 Review state

```text
created → review_pending → partially_approved → published
                       ├── rejected
                       └── failed

published → superseded
```

### 5.4 Independent statuses

```text
metrics_status:  pending | approved | published | rejected | error
contacts_status: pending | approved | published | rejected | error
```

Exemplo válido:

```text
metrics_status: published
contacts_status: pending
```

## 6. Data Contracts

### 6.1 Existing contracts

| Resource | Current role |
|---|---|
| `clients` | Cliente comercial canônico; ainda contém campos Freshdesk legados. |
| `client_donc_instances` | Instâncias Donc e `contrato_saas_id` externo. |
| `client_support` | Projeção mensal, única por `(client_id, ref_month)`. |
| `freshdesk_config` | Metadados Freshdesk e timestamps atuais. |
| `freshdesk_snapshot` | Snapshot atual de staging por `client_support`. |
| `contacts` | Cadastro de contatos do CRM. |
| `contact_emails` | E-mails primários/secundários. |
| `contact_links` | Vínculo contato/cliente e papel. |
| `client_id_reconciliation` | Legados `clients` associados ao cliente canônico. |

### 6.2 Proposed MVP contract

O MVP deve evitar uma migração estrutural completa antes de validar o fluxo. A primeira fase pode manter os contratos atuais e adicionar:

- identificador de execução;
- status por cliente;
- origem e timestamp da importação;
- estados independentes de métricas e contatos;
- trilha de decisão;
- staging separado para reimportação de mês aprovado.

### 6.3 Future normalized model

Se o volume e a governança justificarem, criar:

- `freshdesk_import_batches`;
- `freshdesk_import_records`;
- `freshdesk_companies`;
- `client_freshdesk_companies`;
- `client_donc_instance_freshdesk_companies`;
- `contact_external_identities`;
- `contact_match_decisions`.

Essas tabelas são evolução futura, não parte automática desta especificação sem validação de schema e RLS.

### 6.4 Import idempotency

Cada execução deve ter `run_id` e chave idempotente baseada em fonte, período, escopo e modo. O mesmo payload externo não deve gerar uma segunda revisão por retry.

Retry de um cliente deve ser específico e não reprocessar clientes concluídos sem confirmação.

## 7. Component and Service Responsibilities

### Frontend

- `SettingsFreshdesk.jsx`: shell do Operations Center, status, preflight, mapping e import.
- `SettingsSyncStatus.jsx`: histórico/agendamento; deve ser integrado ou apresentar fonte única de status.
- `FreshdeskPendingPage.jsx`: fila de revisão; deve suportar decisões independentes.
- `SettingsSectionHeader.jsx`: header padrão da área de configurações.
- `src/lib/icons.js`: todos os ícones devem vir do registry.

### Hooks/services

- `useActivities` não participa diretamente do fluxo Freshdesk.
- Criar hooks dedicados ou adaptar queries para status, batches, mapping e review.
- `freshdeskSync.js`: deve deixar de ser fonte paralela de regras de domínio após o executor canônico.
- `freshdeskConfig.js`: deve fornecer preflight e resultado estruturado de metadados.

### Edge Functions

- `freshdesk-proxy`: restringir endpoints/métodos por caso de uso e normalizar erros.
- `monthly-sync`: respeitar estado parcial/blocked e usar executor canônico.
- `operational-report-sync`: resolver exclusivamente por `client_donc_instances`.

## 8. Security and Governance

- Credenciais Freshdesk permanecem em secrets server-side.
- `anon` não deve ler batches, mapping, snapshots ou auditoria.
- Importação é operação de serviço; aprovação/publicação é operação de admin/manager.
- CSMs/analistas veem somente o que as políticas atuais permitirem.
- Auditoria não deve conter tokens nem payloads completos com PII desnecessária.
- Alteração de mapeamento, aprovação, rejeição, merge, reabertura e publicação devem registrar ator, timestamp, antes/depois e justificativa.
- Views novas no schema `public` devem considerar `security_invoker = true` quando aplicável.

## 9. Implementation Phases

### Phase 0 — Contract and baseline

**Status:** Not started

**Rationale:** fechar o contrato operacional e medir o comportamento atual antes de trocar o executor ou a persistência.

**Scope:**

- consolidar estados e permissões;
- documentar diferenças entre manual, cron, script e n8n;
- definir métricas de baseline;
- definir política de reimportação e publicação parcial.

#### Checklist

- [ ] Confirmar permissões de conectar, importar, revisar, publicar, reabrir e remover legado.
- [ ] Confirmar se métricas e contatos podem ser publicados independentemente.
- [ ] Definir `success`, `partial`, `failed` e `blocked`.
- [ ] Definir retenção de snapshots, revisões e auditoria.
- [ ] Documentar fluxo `oak-donc-reports → n8n → operational-report-sync`.
- [ ] **Build:** `npm run build` with no errors.

#### Implementation Log — Phase 0

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

### Phase 1 — Operations Center shell and preflight

**Status:** Not started

**Rationale:** entregar visão e bloqueios antes de alterar a forma como os dados são importados.

**Scope:**

- reorganizar `SettingsFreshdesk`;
- exibir status persistente;
- criar pré-voo sem escrita de métricas;
- integrar ou alinhar `SettingsSyncStatus`.

#### Checklist

- [ ] Implementar primeira viewport e ação contextual.
- [ ] Implementar estados `not_configured`, `connected`, `attention`, `ready`, `failed`.
- [ ] Implementar checks de conexão, metadados, mapeamentos e concorrência.
- [ ] Exibir bloqueios com causa e ação.
- [ ] Preservar funções de atualizar metadados e executar sincronização.
- [ ] Validar desktop, mobile, teclado e leitor de tela.
- [ ] **Build:** `npm run build` with no errors.

#### Implementation Log — Phase 1

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

### Phase 2 — Mapping and identity review

**Status:** Not started

**Rationale:** impedir que importações avancem com identidade de empresa ou contato ambígua.

**Scope:**

- mapping de empresas com sugestões confirmáveis;
- bloqueio de múltiplos IDs não classificados;
- matching de contatos com candidatos e evidências;
- preservação de compatibilidade com colunas antigas.

#### Checklist

- [ ] Criar fluxo de confirmar/rejeitar/adiar sugestão de empresa.
- [ ] Exibir evidência e confiança do match.
- [ ] Suportar múltiplos IDs como estado de classificação, não como campo silencioso.
- [ ] Implementar candidatos de contato por e-mail, ID externo e nome.
- [ ] Bloquear merge automático somente por nome.
- [ ] Adicionar auditoria das decisões.
- [ ] **Build:** `npm run build` with no errors.

#### Implementation Log — Phase 2

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

### Phase 3 — Versioned import and independent review

**Status:** Not started

**Rationale:** impedir sobrescrita de meses aprovados e separar aprovação de métricas e contatos.

**Scope:**

- batch/revision versionada;
- status por cliente;
- staging de reimportação;
- revisão independente;
- publicação auditável.

#### Checklist

- [ ] Definir migration de batch/revision após validar o modelo MVP.
- [ ] Criar `run_id`, idempotency key e status por cliente.
- [ ] Criar nova revisão para mês já publicado.
- [ ] Preservar revisão publicada anterior.
- [ ] Separar `metrics_status` e `contacts_status`.
- [ ] Implementar publicação e rollback conforme permissões aprovadas.
- [ ] **Build:** `npm run build` with no errors.

#### Implementation Log — Phase 3

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

### Phase 4 — Canonical executor and rollout

**Status:** Not started

**Rationale:** remover divergência entre frontend, Edge Function, script e n8n sem quebrar o sync existente.

**Scope:**

- executor canônico;
- retry por cliente;
- status `partial`/`blocked` real;
- observabilidade;
- rollout gradual e fallback.

#### Checklist

- [ ] Escolher implementação canônica do cálculo Freshdesk.
- [ ] Centralizar regras de tickets, SLA, grupos e contatos.
- [ ] Implementar retry limitado para falhas transitórias.
- [ ] Persistir status por cliente e por execução.
- [ ] Comparar caminho novo com o legado em canary.
- [ ] Definir kill switch e rollback.
- [ ] Executar dois ou três ciclos estáveis antes de remover caminhos antigos.
- [ ] **Build:** `npm run build` with no errors.

#### Implementation Log — Phase 4

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

## 10. Acceptance Criteria

- [ ] O usuário identifica o estado da integração sem trocar de tela.
- [ ] Múltiplos Freshdesk IDs não classificados bloqueiam a importação.
- [ ] Sugestões de empresa exigem confirmação humana.
- [ ] Nome sem e-mail não gera merge automático de contato.
- [ ] Métricas e contatos possuem revisão independente.
- [ ] Mês aprovado permanece preservado em uma reimportação.
- [ ] Falha parcial nunca aparece como sucesso completo.
- [ ] Retry é idempotente e direcionado aos clientes falhos.
- [ ] Nenhum fluxo novo usa `contrato_saas_id` como `clients.id`.
- [ ] Decisões relevantes têm ator, timestamp, antes/depois e justificativa.
- [ ] `npm run build` passa em cada fase.
- [ ] Comportamento publicado é validado no ambiente Vercel.

## 11. Success Metrics

### Data quality

- zero novos registros criados com `clients.id = contrato_saas_id`;
- zero merges baseados apenas em nome;
- 100% das publicações com revisão auditável;
- 100% dos múltiplos IDs classificados antes da importação.

### Operations

- redução do tempo entre importação e publicação;
- redução de reimportações completas;
- falhas identificáveis por cliente;
- retry de falhas sem reprocessar clientes concluídos;
- redução de suporte de engenharia para operações mensais.

### Product

- usuários conseguem diferenciar pré-voo, mapeamento, importação e revisão;
- aumento de sugestões confirmadas com segurança;
- redução de contatos duplicados;
- redução de divergência entre execução manual e automática.

## 12. Current Checkpoint

### Production state

- A integração atual continua em produção.
- Proteções de `contrato_saas_id` e reconciliação legada estão publicadas em `30b0f41`.
- A nova interface do Operations Center ainda não foi implementada.
- `TD-007` acompanha a investigação do `oak-donc-reports` na VPS.
- Os seis registros legados não foram removidos.
- Relatórios históricos conflitantes não foram migrados automaticamente.

### Architectural decisions

| Decision | Rationale |
|---|---|
| Uma seção operacional única em vez de telas fragmentadas | Reduz voltas sem transformar o fluxo recorrente em wizard obrigatório. |
| Múltiplos IDs bloqueiam até classificação | Evita consolidar duplicidade ou separar dados sem decisão do cliente. |
| Sugestões sempre exigem confirmação | Um match plausível não é prova suficiente para contaminar indicadores. |
| Contato sem e-mail não faz merge automático | Nomes podem ser homônimos ou incompletos. |
| Métricas e contatos têm revisão independente | Evita estado parcial escondido dentro de uma aprovação única. |
| Reimportação cria nova revisão | Preserva o indicador publicado e permite comparação/rollback. |
| `client_donc_instances` resolve contratos SaaS | `contrato_saas_id` é externo e nunca deve virar `clients.id`. |
| Remoção de legados é fase posterior | Há relatórios históricos conflitantes e a origem externa ainda está em investigação. |

## 13. Open Decisions

1. Quais roles podem executar, revisar, publicar, reabrir e remover?
2. Métricas e contatos podem ser publicados independentemente em produção?
3. Qual é a retenção mínima de batches, snapshots e auditoria?
4. A primeira implementação de revisão usará tabela nova ou extensão controlada de `client_support`?
5. Quais erros são `retryable` e qual o limite de tentativas?
6. Grupos Freshdesk ausentes são warning ou blocker?
7. Como classificar uma empresa Freshdesk compartilhada de forma permanente?
8. Qual acesso ao repositório/logs do `oak-donc-reports` estará disponível?

## Project Gotchas

- O projeto trabalha diretamente em produção; não há stack Supabase local.
- Aplicar migrations com `node_modules/.bin/supabase db push --include-all` quando o CLI global do WSL estiver apontando para o binário Windows.
- Edge Functions alteradas precisam de `node_modules/.bin/supabase functions deploy <name>`.
- O endpoint `operational-report-sync` usa autenticação própria mesmo com `verify_jwt = false`.
- Nunca expor `FRESHDESK_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou secrets n8n no frontend.
- Não usar `clients.id` para representar `contrato_saas_id`.
- Não usar `.limit(1)` para resolver uma identidade externa potencialmente ambígua.
- Antes de alterar `client_support`, verificar a unicidade `(client_id, ref_month)` e o comportamento de dados aprovados.
- O registry de ícones é `src/lib/icons.js`; componentes não devem importar diretamente de `lucide-react`.
- Toda fase de implementação termina com `npm run build`.

## LLM Instructions

1. Leia a Seção 0 e o `Current Checkpoint` antes de editar.
2. Não remova dados legados sem uma migration aprovada e uma comparação de dependências.
3. Consulte a fase ativa e implemente apenas o checklist correspondente.
4. Preserve contratos existentes até a fase de cutover.
5. Use dados reais do schema; não invente colunas ou IDs.
6. Antes de mudanças de schema, valide tabelas, RLS, índices e advisors Supabase.
7. Depois de alterar Edge Functions, faça deploy da função específica.
8. Rode `npm run build` ao finalizar cada fase.
9. Atualize o Implementation Log e o Current Checkpoint com commit, arquivos e gaps.
10. Para retomar o trabalho, não trate sugestões como decisões: consulte a Seção 13 e peça confirmação quando uma regra continuar aberta.

### Technical Summary — Current State

**Commits:** `30b0f41`, `cec0f60`

**Files created:**

- `supabase/migrations/20260816210000_reconcile_legacy_saas_client_ids.sql`

**Files modified:**

- `supabase/functions/operational-report-sync/index.ts`
- `src/components/settings/SettingsDoncAPI.jsx`
- `src/components/clients/tabs/operacional/ClientSubDados.jsx`
- `docs/system/integration-points.md`
- `docs/backlog.md`

**Decisions:**

- Proteção contra novo uso de SaaS ID como cliente.
- Reconciliação legada sem exclusão ou cópia automática conflitante.
- Investigação do `oak-donc-reports` registrada como `TD-007`.

**Issues found:**

- Seis registros legados com IDs iguais a contratos SaaS.
- Relatórios históricos em IDs legados com conteúdo diferente dos destinos canônicos.
- Origem exata de criação fora do repositório, provavelmente no serviço da VPS.

**Pending items:**

- Implementar o Operations Center.
- Definir permissões, retenção, retry e publicação parcial.
- Revisar/migrar relatórios históricos conflitantes.
- Investigar `oak-donc-reports` conforme `TD-007`.
