import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useBillingPayments(clientId) {
  return useQuery({
    queryKey: ['billing_payments', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_payments')
        .select('*')
        .eq('client_id', clientId)
        .order('ref_month', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useLatestBillingPayment(clientId) {
  return useQuery({
    queryKey: ['billing_payments_latest', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_payments')
        .select('*')
        .eq('client_id', clientId)
        .order('ref_month', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data || null
    },
  })
}

export function useBillingPaymentsMutations(clientId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ref_month, status, delay_days, paid_at, note }) => {
      const payload = {
        client_id: clientId,
        ref_month,
        status,
        delay_days: Number(delay_days) || 0,
        paid_at: paid_at || null,
        note: note || null,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('billing_payments')
        .upsert(payload, { onConflict: 'client_id,ref_month' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing_payments', clientId] })
      qc.invalidateQueries({ queryKey: ['billing_payments_latest', clientId] })
      qc.invalidateQueries({ queryKey: ['client', clientId] })
      toast.success('Adimplência salva')
    },
    onError: (e) => toast.error(e.message),
  })
}
