import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useFeatureFlags() {
  const { data: flags = [] } = useQuery({
    queryKey: ['feature_flags'],
    queryFn: async () => {
      const { data } = await supabase.from('feature_flags').select('*')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  /**
   * Retorna true se a flag está habilitada E o perfil do usuário está na lista de allowed_roles.
   * Enquanto as flags ainda estão carregando (flags=[]), retorna false por segurança.
   */
  function isEnabled(key, userRole) {
    const flag = flags.find(f => f.key === key)
    if (!flag || !flag.enabled) return false
    if (!userRole) return false
    return (flag.allowed_roles ?? []).includes(userRole)
  }

  return { flags, isEnabled }
}
