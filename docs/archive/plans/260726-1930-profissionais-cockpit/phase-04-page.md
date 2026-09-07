# Phase 4: Page

## Objective

Criar `ProfissionaisCockpitPage.jsx` com accordion, busca, export CSV/PDF.

## Scope

- Create: `src/pages/ProfissionaisCockpitPage.jsx`

## Preconditions

- Phase 2 (icons) e Phase 3 (hook) completas

## Tasks

1. BackButton + PageHeader com titulo e mes de referencia
2. Toolbar: seletor de mes + busca textual + dropdown CSV
3. Tabela accordion (Set-based), ChevronIcon, colunas: Cliente | Ativos | Δ | Acesso | Δ | OS | Δ
4. ExpandedContent (lazy): loading -> dados -> export botoes
5. CSV export (sintetico toolbar todos, analitico toolbar todos via RPC, individual row ambos)
6. PDF export (individual row, HTML + window.print)
7. Loading/empty/error states
8. Verify: `npm run build`

## Acceptance Criteria

- Pagina renderiza dados do mes anterior
- Seletor de mes funciona
- Accordion expande com lazy load
- CSV sintetico/analitico exporta
- PDF abre print dialog
- Busca filtra clientes
- Loading/empty/error states todos cobertos

## Verification

- `npm run build`
