# CLAUDE.md

See: ./.agents/core-agents.md

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
Dev: `npm run dev`

## Regras de Conduta

- Responda o chat sempre em Português (pt-br) mas os códigos e comentários em inglês.

