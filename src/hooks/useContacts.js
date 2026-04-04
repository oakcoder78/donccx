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
        const cid = Number(filters.client_id)
        result = result.filter(c => c.contact_links.some(l => l.client_id === cid))
      }
      if (filters.papel) {
        result = result.filter(c => c.contact_links.some(l => l.papel === filters.papel))
      }
      if (filters.status) {
        result = result.filter(c => c.contact_links.some(l => l.engajamento === filters.status))
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
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts'] })
    qc.invalidateQueries({ queryKey: ['client'] })
    qc.invalidateQueries({ queryKey: ['clients'] })
  }

  const create = useMutation({
    mutationFn: async ({ phones, links, ...payload }) => {
      const { data, error } = await supabase.from('contacts').insert(payload).select().single()
      if (error) throw error
      if (phones?.length) {
        await supabase.from('contact_phones').insert(phones.map(p => ({ ...p, contact_id: data.id })))
      }
      if (links?.length) {
        const linkRows = links.map(l => ({ ...l, contact_id: data.id, client_id: Number(l.client_id) }))
        console.log('[useContacts create] inserting contact_links:', linkRows)
        const { error: linkErr } = await supabase.from('contact_links').insert(linkRows)
        if (linkErr) { console.error('[useContacts create] contact_links insert error:', linkErr); throw linkErr }
      }
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Contato criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, phones, links, contact_phones, contact_links, ...payload }) => {
      const { data, error } = await supabase.from('contacts').update(payload).eq('id', id).select().single()
      if (error) throw error
      if (phones !== undefined) {
        await supabase.from('contact_phones').delete().eq('contact_id', id)
        if (phones.length) await supabase.from('contact_phones').insert(phones.map(p => ({ ...p, contact_id: id })))
      }
      if (links !== undefined) {
        await supabase.from('contact_links').delete().eq('contact_id', id)
        if (links.length) {
          const linkRows = links.map(l => ({ ...l, contact_id: id, client_id: Number(l.client_id) }))
          console.log('[useContacts update] inserting contact_links:', linkRows)
          const { error: linkErr } = await supabase.from('contact_links').insert(linkRows)
          if (linkErr) { console.error('[useContacts update] contact_links insert error:', linkErr); throw linkErr }
        }
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

export function useUnlinkContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (linkId) => {
      const { error } = await supabase.from('contact_links').delete().eq('id', linkId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['client'] })
    },
    onError: (e) => toast.error(e.message),
  })
}
