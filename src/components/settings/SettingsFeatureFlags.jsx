import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import toast from 'react-hot-toast'

const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin'   },
  { value: 'manager', label: 'Manager' },
  { value: 'csm',     label: 'CSM'     },
  { value: 'analyst', label: 'Analyst' },
]

export function SettingsFeatureFlags() {
  const qc = useQueryClient()

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['feature_flags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('feature_flags').select('*').order('key')
      if (error) throw error
      return data || []
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feature_flags'] })
      toast.success('Salvo')
    },
    onError: e => toast.error(e.message),
  })

  if (isLoading) return <p className="text-sm text-text-tertiary">Carregando...</p>

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Funcionalidades</h2>
        <p className="text-xs text-text-tertiary mt-1">
          Ative ou desative módulos e controle quais perfis têm acesso.
        </p>
      </div>

      {flags.map(flag => (
        <div key={flag.id} className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-3">
          {/* Header: descrição + toggle */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">
                {flag.description || flag.key}
              </p>
              <p className="text-xs text-text-tertiary font-mono mt-0.5">{flag.key}</p>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              onClick={() => update.mutate({ id: flag.id, patch: { enabled: !flag.enabled } })}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                flag.enabled ? 'bg-donc-navy' : 'bg-border-secondary'
              }`}
              aria-pressed={flag.enabled}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  flag.enabled ? 'translate-x-[19px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </div>

          {/* Perfis com acesso */}
          <div>
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
              Perfis com acesso
            </p>
            <div className="flex flex-wrap gap-4">
              {ROLE_OPTIONS.map(role => {
                const checked = flag.allowed_roles?.includes(role.value) ?? false
                return (
                  <label
                    key={role.value}
                    className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        const curr = flag.allowed_roles || []
                        const next = e.target.checked
                          ? [...curr, role.value]
                          : curr.filter(r => r !== role.value)
                        update.mutate({ id: flag.id, patch: { allowed_roles: next } })
                      }}
                      className="w-3.5 h-3.5 rounded"
                    />
                    {role.label}
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      ))}

      {flags.length === 0 && (
        <p className="text-sm text-text-tertiary text-center py-8">
          Nenhuma feature flag cadastrada.
        </p>
      )}
    </div>
  )
}
