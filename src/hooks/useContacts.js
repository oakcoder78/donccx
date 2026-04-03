import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useContacts(filters = {}) {
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select(`*, contact_phones(*), contact_links(*, clients(id, name))`)
        .order('name')

      if (filters.search) q = q.ilike('name', `%${filters.search}%`)

      const { data, error } = await q
      if (error) { console.error('[useContacts] query error:', error); return [] }

      let result = data ?? []
      if (filters.client_id) {
        result = result.filter(c => c.contact_links.some(l => l.client_id === filters.client_id))
      }
      if (filters.papel) {
        result = result.filter(c => c.contact_links.some(l => l.papel === filters.papel))
      }
      if (filters.engajamento) {
        result = result.filter(c => c.contact_links.some(l => l.engajamento === filters.engajamento))
      }
      if (filters.champion) {
        result = result.filter(c => c.contact_links.some(l => l.champion === true))
      }
      return result
    },
    retry: 0,
  })
}

export function useContactMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['contacts'] })

  const create = useMutation({
    mutationFn: async ({ phones, links, ...payload }) => {
      const { data, error } = await supabase.from('contacts').insert(payload).select().single()
      if (error) throw error
      if (phones?.length) {
        await supabase.from('contact_phones').insert(phones.map(p => ({ ...p, contact_id: data.id })))
      }
      if (links?.length) {
        await supabase.from('contact_links').insert(links.map(l => ({ ...l, contact_id: data.id })))
      }
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Contato criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, phones, links, ...payload }) => {
      const { data, error } = await supabase.from('contacts').update(payload).eq('id', id).select().single()
      if (error) throw error
      if (phones !== undefined) {
        await supabase.from('contact_phones').delete().eq('contact_id', id)
        if (phones.length) await supabase.from('contact_phones').insert(phones.map(p => ({ ...p, contact_id: id })))
      }
      if (links !== undefined) {
        await supabase.from('contact_links').delete().eq('contact_id', id)
        if (links.length) await supabase.from('contact_links').insert(links.map(l => ({ ...l, contact_id: id })))
      }
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Contato atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Contato removido') },
    onError: (e) => toast.error(e.message),
  })

  return { create, update, remove }
}
