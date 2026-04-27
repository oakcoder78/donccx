# Data Flow

Este documento descreve como os dados fluem dentro da aplicação, desde a interação do usuário até a persistência e o retorno visual na interface.

O fluxo de dados segue a arquitetura modular baseada em:

- Pages (orquestração de telas)
- Components (interface do usuário)
- Hooks (lógica de dados)
- Services (operações externas e persistência)
- Lib (regras e utilidades)
- Contexts (estado global)

A separação entre essas camadas garante previsibilidade, reutilização e desacoplamento entre partes do sistema.

---

## User Interaction Flow

Este fluxo descreve o comportamento típico quando um usuário executa uma ação na interface.

1. **Interação do usuário**  
   O usuário executa uma ação na interface, como:

   - Criar um cliente
   - Registrar uma atividade
   - Atualizar um projeto
   - Editar um contato

2. **Componente chama Hook**  
   O componente React responsável pela interface chama um hook específico.

   Exemplos reais:

   - `useClients`
   - `useActivities`
   - `useProjects`
   - `useContacts`
   - `useHealthScore`

3. **Hook executa lógica de estado**  
   O hook gerencia:

   - estados locais (`loading`, `data`, `error`)
   - validação
   - preparação de dados

4. **Hook chama Service ou Supabase Client**  
   O hook utiliza:

   - `supabaseClient`
   - funções da camada `services`
   - utilidades da camada `lib`

   Isso permite comunicação com:

   - banco de dados
   - armazenamento de arquivos
   - integrações externas

5. **Resultado retorna ao Hook**  
   Após a execução:

   - dados são retornados
   - erros são tratados
   - estado é atualizado

6. **UI é re-renderizada**  
   A atualização de estado provoca a atualização visual da interface.

---

## Read Flow (Data Fetch)

Este fluxo descreve como os dados são carregados quando uma página é aberta.

Fluxo típico:

1. Uma página é carregada (ex.: Clients, Dashboard, Projects).
2. O componente inicial chama um hook de leitura.

Exemplos:

- `useClients`
- `useActivities`
- `useProjects`
- `useContacts`
- `useSegments`
- `useStages`

3. O hook executa `useEffect` para buscar dados.
4. O hook usa:

   - `supabaseClient`
   - funções da camada `lib`
   - serviços externos configurados

5. Os dados retornam e são armazenados no estado do hook.
6. O componente consome esses dados e renderiza:

   - listas
   - cards
   - tabelas
   - gráficos

Esse padrão é usado em praticamente todas as telas do sistema.

---

## Write Flow (Data Mutation)

Este fluxo descreve como dados são criados, atualizados ou removidos.

### Criação

Exemplo:

- Criar cliente
- Registrar atividade
- Criar projeto

Fluxo:

1. Usuário preenche um formulário.
2. Componente envia os dados para um hook.
3. O hook executa validações.
4. O hook chama:

   - `supabaseClient.insert`
   - ou funções da camada `services`

5. O registro é persistido.
6. O estado local é atualizado ou os dados são recarregados.

---

### Atualização

Exemplo:

- Editar cliente
- Atualizar status de projeto
- Modificar atividade

Fluxo:

1. Usuário altera dados existentes.
2. Hook chama operação `update`.
3. O banco é atualizado.
4. O estado local reflete a alteração.

---

### Exclusão

Exemplo:

- Remover atividade
- Excluir contato
- Soft delete de anexos

Fluxo:

1. Usuário confirma remoção.
2. Hook executa operação de exclusão.
3. O registro é removido ou marcado como inativo.
4. A interface é atualizada.

---

## Global State Flow

O estado global é gerenciado através do:

```text
AuthContext