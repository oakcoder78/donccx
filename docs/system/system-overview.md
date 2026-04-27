# System Overview

Este documento serve como ponto central de navegação da documentação arquitetural do **doncCX Hub**, conectando todos os guias técnicos produzidos até o momento.

---

## Recommended Reading Order

Os documentos abaixo devem ser lidos na seguinte sequência para obter uma compreensão completa da estrutura, dos fluxos e das decisões de arquitetura:

1. **System Purpose**
   - `docs/system/system-purpose.md`
   - Visão geral de objetivo, usuários‑alvo e metas operacionais.
2. **High-Level Architecture**
   - `docs/system/high-level-architecture.md`
   - Diagrama conceitual das camadas principais (Frontend, BaaS, Serviços externos).
3. **Core Modules**
   - `docs/system/core-modules.md`
   - Descrição dos módulos centrais que implementam a lógica de negócios.
4. **Shared Modules**
   - `docs/system/shared-modules.md`
   - Módulos reutilizáveis (UI, Layout, Hooks, Contexts, Lib, Services, Donkie).
5. **Data Flow**
   - `docs/system/data-flow.md`
   - Como os dados transitam da UI até a persistência e retornam.
6. **Integration Points**
   - `docs/system/integration-points.md`
   - Pontos de integração com Supabase, Freshdesk, Donc API, OpenRouter e Storage.
7. **Deployment Context**
   - `docs/system/deployment-context.md`
   - Onde o sistema roda, detalhes de infra‑estrutura e variáveis de ambiente.
8. **Future Architecture**
   - `docs/system/future-architecture.md`
   - Possíveis evoluções, otimizações e estratégias de crescimento.

---

## Modules Reference

Os módulos individuais do sistema estão detalhados na pasta `docs/modules/`. Cada módulo contém exemplos de uso, API pública e notas de manutenção.

```text
/docs/modules/
│   ui.md                # Componentes de interface reutilizáveis
│   layout.md            # Estruturas de layout e responsividade
│   hooks.md             # Hooks customizados de React
│   contexts.md          # Provedores de estado global
│   lib.md               # Bibliotecas utilitárias de baixo nível
│   services.md          # Abstrações de comunicação externa
│   donkie.md            # Ferramentas de IA e automação
```

---

## How to Contribute

- Atualize o documento correspondente ao módulo que você alterou.
- Mantenha a ordem de leitura recomendada.
- Use o padrão de cabeçalhos (`##`) para novas seções e `-` para listas.
- Não introduza novas dependências sem refletir a mudança na documentação de `Integration Points` ou `Deployment Context`.

---

**Visão geral:**

```
Frontend (React) → Supabase (BaaS) → External APIs (Freshdesk, Donc, OpenRouter)
```

Esta cadeia reflete a arquitetura atual e os documentos acima detalham cada elo.
