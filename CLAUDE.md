# CLAUDE.md

Read .agents\core-agents.md

All routing rules defined there.

# doncCX — Instruções para Claude Code

## Regras de Git (OBRIGATÓRIO)

- **Sempre trabalhar na branch `main` diretamente.** Nunca criar branches separadas nem feature branches.
- **Nunca usar worktrees** (`--worktree`, `EnterWorktree`, etc.).
- **Todo commit vai direto para `main`:** usar sempre `git push origin main`.
- Nunca fazer `git checkout -b`, `git switch -c` ou qualquer variante que crie nova branch.

## Projeto

Stack: React 18 + Vite + TailwindCSS 3 + Supabase + TanStack Query v5  
Raiz: `E:\donc\donccx`

**Comandos:**
- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

**Estrutura src/:**
`pages/` · `components/` · `hooks/` · `services/` · `contexts/` · `lib/`

**Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Workflow Obrigatório (ver `.agents/core-agents.md`)

Para qualquer mudança em módulos existentes:
1. `module-detector` → identifica módulo ativo
2. `docs-lookup` → revisa padrões antes de implementar
3. `supabase-guard` → valida impacto em schema (se DB)
4. `docs-writer` → atualiza docs se mudança moderada/major

## Regras de Conduta

- Responda o chat sempre em Português (pt-br) mas os códigos e comentários em inglês.

