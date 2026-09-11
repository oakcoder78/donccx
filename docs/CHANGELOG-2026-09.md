# Changelog


# Changelog — 2026-09

## 2026-09-11

### Cockpit Financeiro — SDD 0–5 + UI v2/v2.1 + Help v1.0

- **Fase 0/0.1:** SDD v0.2/v0.3 série-aware; HTML de regras validado por Financeiro/Vendas (ata no BRD 0.6) — `usage_driven` (travado × base+excedente), 4º tipo `desconto_unidade`, reajuste anual sem retroativo, papéis `admin/manager/finance` (sales fora; lê exceções na ficha).
- **Fase 1 (`a06120e`):** migration `20260911191431_financeiro_cockpit_core` — engine `_financeiro_series_month`, `billing_exceptions` (4 tipos, RLS select `admin,manager,finance,sales` / write `admin,finance`), `contract_series.usage_driven` + `correction_*`, flag `cockpit_financeiro`, RPCs `get_financeiro_cockpit|detalhe|export`. Histórico de migrations reconciliado (8 locais `applied` / 8 órfãs `reverted`) + `split_health_cockpit` aplicada.
- **Fase 2 (`5e1f069`):** `src/lib/financeiro.js`, `useFinanceiroCockpit`, `FinanceiroCockpitPage` (KPIs T1–T7, toolbar, accordion), rota `<CockpitRoute flagKey="cockpit_financeiro">`, card no hub, flag registrada; form V2 com `usage_driven` + reajuste + renovação assistida; paridade `resolveMRR`.
- **Fase 3 (`04c00a2`):** `ExcecaoModal` (4 tipos, escopo cliente/série, sem retroativo), `PaymentToggle`, espelhos no detalhe e na aba Contrato; matriz RLS validada em produção.
- **Fase 4 (`cda1206`):** exports CSV (geral/faturável/isento; global e por cliente) + PDF com CNPJ/SaaS_ID.
- **Fase 5 (`b69562d`):** Help do cockpit, `docs/modules/clients.md`, flag ligada.
- **UI v2 (`78b2417`):** expandir inline, extrato da competência (vencimento/período + "Total do mês"), "Pendências de adimplência" (RPC `get_financeiro_pendencias`, `20260911215006`), `PaymentToggle` com seletor de competência, PDF só ativos, CSV 1 profissional/linha.
- **UI v2.1 (`1da9767`):** pendências colapsadas; painel sem repetir cliente/CNPJ; extrato com Valor unit./Piso/Acima do piso (`get_financeiro_detalhe` expõe `unit`/`floor`, `20260911223319`).
- **Help v1.0 (`a8622b8`):** `docs/sdd/financeiro-cockpit-regras.html` + `public/help/financeiro-regras.html` refatorados para ajuda (TOC, FAQ de uso, sem enquadramento de validação), revisados por subagentes.

## 2026-09-07

### Dashboard V3 — polimento dos blocos (`14472b5`)

- **Saúde por dimensão:** botão "abrir Health Score" some para papéis sem `health_cockpit` (antes levava a `/module-unavailable`). `SaudeDimensaoBlock.jsx` recebe `canSeeHealth` (com fallback `health`); `MeuDiaV3Page.jsx` computa via flags.
- **Projetos em aberto:** "ver todos" não navega mais para `/cockpits` (tela em branco para quem não tem cockpit) — abre drawer local `ProjetosAbertosDrawer.jsx` com toda a base + busca, gating por linha via `canDrillIn`.
- **Mapa vivo do ecossistema:** clique no estado/chip abre drawer lateral (`EcossistemaUfDrawer.jsx`: fantasia, cidade, health, cliente desde) com push do mapa (`drawerPushStyle`) + highlight do estado (`BrazilMap.jsx` `selectedUF`); param `?estado=` passa a funcionar (`useClients.js` filtro `address_state` + chip removível em `ClientsPage.jsx`); migration `20260903000000` adiciona `address_city/contract_start/created_at` ao `get_dashboard_clients_overview`.
- **Empresas:** `+ Nova Empresa`/`Editar` escondidos para papéis sem escrita (só `admin/manager/finance`).

### Empresas — leitura global + detalhe por papéis (`e99ade1`, `152b30f`)

- **Opção A:** `clients_global_select FOR SELECT USING (true)` (`20260903000001`) — todos veem todos os cards; escrita segue só `admin/manager/finance` (RLS).
- **Detalhe:** só `admin/manager` veem todas as tabs; demais só `overview` + `anexos` (tabs desabilitadas + redirect automático). `+ Nova Empresa`/`Editar` só `admin/manager/finance` (`ClientsPage.jsx`, `ClientDetail.jsx`).
- **Financeiro blindado no Network:** `useClients.js`/`useClient.js` usam `SELECT` explícito sem `mrr/billing_*` para papéis sem `financial_data` (`SAFE_CLIENT_COLS`); card só renderiza MRR com `canSeeFinancial`.
- **Fix:** `canSeeFinancial` hoisted antes de `useClients` (`ReferenceError` em produção).

### Empresas — sales cria/edita carteira + anexos (`88da21a`, `49f190d`)

- **Sales:** `+ Nova Empresa` visível; `Editar` só na carteira (`comercial_id/csm_id = profile.id`); form defaulta `comercial_id` ao próprio sales. RLS `20260903000002` (`clients_sales_insert/update` com `WITH CHECK` de carteira).
- **Anexos:** aba `Anexos` em `ClientFormContent` (`TABS_V2` 5 tabs; `/nova` com `pendingFiles` enviados após salvar; `/editar` com `ClientSubAnexos allowUpload`); botão `+ Adicionar anexo` em `?tab=anexos` (upload `activityId null` → pasta `avulso`); leitura para todos com acesso, upload só `admin/manager/finance` (+ sales na carteira).

### Contratos — séries contratuais (`3df4f0f`, `97c9c49`, `56cd54a`→`8c77c2e`, `e534156`, `aa87554`)

- **Modelo:** `contract_series` (`original|aditivo|renegociacao`, `billing_start/end`, `due_day` = dia do início, `auto_renew`, `status`, `reason` obrigatório em renegociação; `20260907000001` + backfill, 29 com `ref_month` real). Charges com `series_id/ref_month/due_date` (`20260907000003`); payments PK `(client, series, month)` = 2 faturas no mês; tiers PK `(client, series, order)`; `module_pricing.series_id` (`20260907000002`).
- **Tudo por série:** plano, status, tiers, mods, evolução, eventuais + assinatura/renovação/índice; `clients.*` espelho da original; MRR derivado (`resolveMRR`, base própria por série, original pausada na janela de renegociação); renegociações não se sobrepõem; renovação = nova série; encerrar com modal + motivo (nunca deleta); auditoria em `audit_logs`.
- **Datas:** `billing_start` por série (default `contract_start`); preview `05/set/26`; eventuais com date picker DD/MM/AAAA real (`due_date` por parcela, sem rebate); fim auto (`billing_start + N − 1`); `due_day` editável.
- **Produtos:** opcionais (sem gate de presença); seção unificada `Produtos e serviços` por série (serviços chips + soluções rateio sem status, valor opcional, sem placeholder); status do módulo no Operacional (espelho + dropdown → `client_catalog`); soma só exigida com todos os valores preenchidos.
- **V2 definitivo:** `ClientsPage`/`ClientDetail` sempre nas rotas, sem flag; `ClientFormPage` sem gate; `ClientForm.jsx` legado deletado. Submit travado até `seriesReady` + validação pela união + anti-wipe (nunca persiste buffer vazio).

## 2026-09-02

### Empresas — fix barra vertical nas abas de detalhe e edição

- **Fix:** abas de `ClientDetail` (`/empresas/:id`) e `ClientFormContent` (`/empresas/:id/editar`, `/empresas/nova`, `/labs/empresas_v2`) exibiam barra de rolagem vertical fina à direita do card. Causa: `border-b-2 -mb-px` das abas + container `overflow-x-auto` sem trava vertical (`src/index.css:71` define `::-webkit-scrollbar { width:6px }`).
- **Fix:** adicionado `overflow-y-hidden` aos containers de abas — `src/components/clients/ClientDetail.jsx:94` e `src/components/clients/ClientFormContent.jsx:506` (`overflow-x-auto overflow-y-hidden`). Mantém scroll horizontal em viewport estreita, elimina o vertical. `npm run build` ok.

### Empresas form v2 — flag ligada (admin/finance/sales)

`feature_flags.empresas_form_v2` → `enabled = true`, `allowed_roles = ['admin','finance','sales']`.
A partir de agora, para esses papéis, `/empresas` "+ Nova Empresa" e o "Editar" de `/empresas/:id`
abrem a página nova (`ClientFormPage`, sem banner labs) em vez do modal legado.

- **`manager` e `csm` ficam de fora** de propósito: as políticas RLS de escrita das tabelas do
  motor são `admin/finance/sales` (`contract_charges` `charges_write`, `billing_os_tiers`
  `os_tiers_write`). Esses papéis continuam no modal legado (`ClientForm`), que não tem motor.
  Para incluí-los, ampliar as policies OU esconder o motor/handoff da UI para papéis read-only.
- `/labs/empresas_v2` segue admin-only, independente da flag.
- Reversível: `update feature_flags set enabled=false where key='empresas_form_v2'`.

### Empresas form v2 — refatoração UI/UX da aba Contrato + correções

`ClientFormContent` é compartilhado por `/labs/empresas_v2` (playground admin) e `/empresas/nova`
(produção, atrás da flag `empresas_form_v2`, **off**). Sem mudança de schema. Uma mudança de regra
de gravação (MRR — ver abaixo).

**Novos primitivos** — `src/components/clients/form/`
- `FormSection.jsx` — bloco de seção plano (título + traço fino + corpo; colapso opcional com
  resumo de 1 linha; check discreto quando válido). Substitui os sub-cards aninhados.
- `InfoHint.jsx` — popover `?`, único ponto de explicação/exemplo por seção.
- Documentados em `docs/ui-patterns.md` #25.

**Aba Contrato** — de 2 colapsáveis aninhando 4 níveis de caixa para ~6 blocos planos.
- Linguagem de comercial/financeiro, sem nomes de tabela na tela:
  "Motor de contrato — recorrência" → **Evolução da recorrência (MRR)**;
  "Valores eventuais" → **Cobranças Eventuais**;
  "Rateio por módulo" → **Divisão do MRR por produto**;
  "Não bilhetável" → **Não cobrar**; "Mensalidade base" → **MRR base**.
- Modo de regra na UI reduzido a "Valor fixo (R$)" / "% da recorrência" (o modo `base` do lib
  segue suportado internamente).
- Linhas em grid de colunas fixas (alinhamento consistente) + `overflow-x-auto` para telas
  estreitas. Ações usam ícones lucide (`Icons.X` / `Icons.Plus` / `Icons.Eye`).
- Validação: banner só em erro; sucesso = check no título. Removidos o painel `?` âmbar, os chips
  por linha e o rodapé de exemplo `rules[0..2]` (corrige "R$ 0,00" espúrio com < 3 regras).
  Preview do motor simplificado para `Mês | Recorrência`.
- "Próximo →" mostra erro inline de regras/faixas (antes só barrava no submit).

**Demais abas** — Dados / Endereço / Operacional agrupadas em `FormSection`; parênteses técnicos
removidos. Toggle "Contrato ativo" **removido** da aba Dados — `contract_active` é derivado de
`billing_status` no save; o toggle editável só confundia (era sobrescrito no submit).

**Handover nunca é obrigatório** — nenhuma validação bloqueia o save por causa do handoff, em
nenhum `lifecycle_stage`. A gravação em `client_handovers` dispara se **qualquer** um dos 10
campos estiver preenchido (antes checava só 3) e erro real vira toast sem bloquear.

**Regra de gravação — MRR** — `clients.mrr` passa a gravar **0** quando `billing_status != 'ativo'`
(suspenso / não cobrar), em vez de sempre gravar o mínimo contratual.

**`EmpresasV2Page`**
- Seletor "Editar empresa existente" (busca por nome/fantasia via `useAllClients`, resultado
  clicável → `/labs/empresas_v2/:id/editar`). Antes só editando pela URL na mão.
- Banner enxugado; footnote "DDL pendente" removida — tudo já migrado (`contract_charges`,
  `billing_os_tiers`, `client_handovers`, colunas `billing_status/erp/ti_tipo`).

**Bugs corrigidos**
- **Motor não persistia no cadastro novo**: `useContractChargesMutations` /
  `useBillingOsTiersMutations` estavam presas ao `client?.id` (undefined na criação) → `DELETE
  ...client_id=eq.undefined` (400). Agora aceitam `clientId` no payload; `handleSubmit` passa o id
  recém-criado.
- **Form não recarregava ao reeditar**: `ClientFormContent` semeia o state de `client` num
  `useState` initializer (roda 1×) e o React reaproveitava a instância → form vazio até reload.
  Fix: `key={edit-<id> | new}` em `<ClientFormContent>` (`EmpresasV2Page` + `ClientFormPage`) +
  `qc.removeQueries(['client' | 'contract_charges' | 'billing_os_tiers', id])` no fim do save.
- Coerção de `null → ''` no state de edição (elimina warning "value prop should not be null").

**Limpeza** — removido o fallback "modo compatibilidade" (`labsPayload` → catch → `basePayload`),
morto desde que as colunas foram migradas; `payload` único agora.

**Verificado** (`/labs/empresas_v2`, admin, dados reais + diff no banco): cadastro por licença
(períodos + cobrança eventual parcelada), cadastro por OS (faixas), edição de empresa legada
(OSIRNET, `cliente`) sem perda de campo, reedição via seletor, aba Endereço, handover parcial.
`npm run build` limpo.
