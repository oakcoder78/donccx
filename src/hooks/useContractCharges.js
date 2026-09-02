import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useContractCharges(clientId) {
  return useQuery({
    queryKey: ['contract_charges', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_charges')
        .select('*')
        .eq('client_id', clientId)
        .order('month_index')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useContractChargesMutations(clientId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ charges, clientId: overrideId }) => {
      // charges: expanded array of { month_index, kind, mode, amount, percent, label, installment_group, installments_total }
      // clientId override lets the create flow target the freshly created client id
      const id = overrideId || clientId
      if (!id) throw new Error('Cliente não identificado para salvar o contrato')
      // Replace all recorrencia/implantacao for this client (simplest)
      const { error: delErr } = await supabase.from('contract_charges').delete().eq('client_id', id)
      if (delErr) throw delErr
      if (!charges || charges.length === 0) return []
      const payload = charges.map(c => ({
        client_id: id,
        kind: c.kind || 'recorrencia',
        mode: c.mode,
        month_index: c.month_index,
        amount: c.mode === 'absolute' ? c.amount : null,
        percent: c.mode === 'percent' ? c.percent : null,
        installment_group: c.installment_group || null,
        installments_total: c.installments_total || null,
        label: c.label || null,
        reason: c.reason || null,
      }))
      const { data, error } = await supabase.from('contract_charges').insert(payload).select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract_charges', clientId] })
      toast.success('Regras de contrato salvas')
    },
    onError: (e) => toast.error(e.message),
  })
}
