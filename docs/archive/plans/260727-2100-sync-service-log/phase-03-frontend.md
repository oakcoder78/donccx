# Phase 3: Frontend

## Objective

Exibir "Última sincronização" no cockpit de profissionais, alinhado à direita na toolbar.

## Scope

- Modify: `src/pages/ProfissionaisCockpitPage.jsx`

## Preconditions

- Phase 1 complete (table exists with data)
- Phase 2 complete (edge function populates data)

## Tasks

1. Adicionar query `lastSync` (useQuery inline ou no hook):
   ```js
   const { data: lastSync } = useQuery({
     queryKey: ['last_donc_sync', refMonth],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('sync_service_log')
         .select('finished_at')
         .eq('service_name', 'donc-api')
         .eq('ref_month', refMonth)
         .eq('status', 'success')
         .order('finished_at', { ascending: false })
         .limit(1)
         .maybeSingle()
       if (error) throw error
       return data
     },
     staleTime: 0,
     enabled: !!refMonth,
   })
   ```

2. Importar `Icons.Clock` (já existe em icons.js)

3. Na toolbar, entre a busca e o botão CSV, adicionar elemento alinhado à direita:
   ```jsx
   <span className="ml-auto text-xs text-text-tertiary flex items-center gap-1 flex-shrink-0">
     <Icons.Clock className="w-3.5 h-3.5" />
     {lastSync?.finished_at ? (
       <>Última sinc: {new Date(lastSync.finished_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', timeZoneName: 'short' })}</>
     ) : (
       <span className="italic">Nunca sincronizado</span>
     )}
   </span>
   ```

4. Verify: `npm run build`

## Acceptance Criteria

- Cockpit mostra "Última sinc: DD/MM/AAAA, HH:MM:SS BRT" alinhado à direita
- O elemento sempre renderiza; quando `lastSync` é null/undefined, exibe "Nunca sincronizado" em itálico (`a685e9f`)
- `staleTime: 0` — sempre revalida em refetch (escolha consciente vs. `60_000` da spec original)
- Formato de data consistente com `SettingsSyncStatus` (BRT)
- `queryFn` deve retornar `data` diretamente (não `{data, error}`) — ver nota em spec seção Frontend

## Verification

- `npm run build`
- Acessar cockpit e verificar exibição do timestamp

## Idempotence and Recovery

- Se query falhar → timestamp não aparece (degradação graciosa)
- Se sync_service_log estiver vazio → nada exibido

## Exit Criteria

- [ ] Build passa
- [ ] Timestamp visível no cockpit após sync
