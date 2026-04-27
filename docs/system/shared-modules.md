# Shared Modules

Descreve os módulos técnicos reutilizáveis que dão suporte aos módulos principais do sistema, facilitando a reutilização de código e o desacoplamento entre funcionalidades.

## UI

- **Papel técnico:** Componentes de interface visual reutilizáveis que abstraem elementos de UI comuns.
- **Funcionalidade:** Botões, inputs, ícones, cards, modais, carregadores etc.
- **Dependências:** Utilizado por quase todas as páginas e módulos de layout para compor a experiência do usuário.
- **Contribuição:** Centraliza o estilo e a lógica visual, reduzindo duplicação e permitindo mudanças globais de UI em um único ponto.

## Layout

- **Papel técnico:** Estruturas de layout que organizam a disposição da UI em páginas e rotas.
- **Funcionalidade:** Grid, contêineres, cabeçalhos, barras laterais, áreas de conteúdo responsivas.
- **Dependências:** Consumido por `pages/*` e pelos módulos de UI para posicionamento consistente.
- **Contribuição:** Garante consistência visual entre diferentes partes da aplicação e facilita a reordenação de seções sem tocar na lógica de negócios.

## Hooks

- **Papel técnico:** Funções customizadas de React que encapsulam lógica de estado e efeitos reutilizáveis.
- **Funcionalidade:** Hooks como `useClients`, `useActivities`, `useProjects`, `useHealthScore`, `useSegments`, `useStages`, entre outros, responsáveis por encapsular acesso a dados e lógica reutilizável.
- **Dependências:** Usado por componentes de UI, contextos e serviços que precisam de lógica reativa.
- **Contribuição:** Evita repetição de código de efeito/estado e promove testes unitários isolados.

## Contexts

- **Papel técnico:** Provedores de estado global que compartilham dados entre componentes sem prop drilling.
- **Funcionalidade:** Gerenciamento de autenticação e sessão do usuário através do `AuthContext`.
- **Dependências:** Qualquer componente que precise acessar informações globais (UI, hooks, serviços).
- **Contribuição:** Centraliza o gerenciamento de estado compartilhado, melhorando a escalabilidade e a manutenção.

## Lib

- **Papel técnico:** Bibliotecas utilitárias de baixo nível que não dependem de React.
- **Funcionalidade:** Helpers de formatação, manipulação de datas, validação, wrappers de API, etc.
- **Dependências:** Utilizado por hooks, serviços e, ocasionalmente, por componentes que precisam de lógica pura.
- **Contribuição:** Isola funcionalidades genéricas, facilitando a reutilização em diferentes contextos (frontend, scripts, tests).

## Services

- **Papel técnico:** Camada de abstração para chamadas externas e lógica de negócio.
- **Funcionalidade:** Integrações com Supabase, gerenciamento de anexos de atividades e comunicação com serviços externos configurados no sistema.
- **Dependências:** Consumido por hooks, componentes de UI (via callbacks) e scripts de backend.
- **Contribuição:** Mantém a separação entre comunicação externa e a UI, permitindo mockar/ substituir serviços facilmente.

## Donkie

## Donkie

- **Papel técnico:** Interface de assistente interno da aplicação, integrada à experiência do usuário.
- **Funcionalidade:** Componentes como `DonkieButton` e `DonkiePanel` que permitem abrir e interagir com o assistente dentro da interface.
- **Dependências:** Utilizado por páginas e componentes que integram funcionalidades assistidas ou automatizadas.
- **Contribuição:** Introduz uma camada interativa adicional para suporte operacional e automação interna.