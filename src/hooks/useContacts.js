import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useContacts(filters = {}) {
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn: async () => {
      const q = supabase
        .from('contacts')
        .select(`*, contact_phones(*), contact_emails(*), contact_links(*, clients(id, name, fantasy_name))`)
        .order('name')

      const { data, error } = await q
      if (error) { console.error('[useContacts] query error:', error); return [] }

      let result = data ?? []
      if (filters.search) {
        const term = filters.search.toLowerCase()
        result = result.filter(c =>
          c.name?.toLowerCase().includes(term) ||
          c.contact_links?.some(l =>
            l.clients?.name?.toLowerCase().includes(term) ||
            l.clients?.fantasy_name?.toLowerCase().includes(term)
          )
        )
      }
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

// ── Helpers de e-mail ─────────────────────────────────────────────────────────
async function syncContactEmails(contactId, primaryEmail, extraEmails) {
  await supabase.from('contact_emails').delete().eq('contact_id', contactId)
  const rows = []
  if (primaryEmail) rows.push({ contact_id: contactId, email: primaryEmail, type: 'work', is_primary: true })
  for (const e of (extraEmails ?? [])) {
    if (e.email?.trim()) rows.push({ contact_id: contactId, email: e.email.trim(), type: e.type || 'work', is_primary: false })
  }
  if (rows.length) await supabase.from('contact_emails').insert(rows)
}

export function useContactMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts'] })
    qc.invalidateQueries({ queryKey: ['client'] })
    qc.invalidateQueries({ queryKey: ['clients'] })
  }

  const create = useMutation({
    mutationFn: async ({ phones, links, extra_emails, ...payload }) => {
      const { data, error } = await supabase.from('contacts').insert(payload).select().single()
      if (error) throw error
      if (phones?.length) {
        await supabase.from('contact_phones').insert(phones.map(p => ({ ...p, contact_id: data.id })))
      }
      if (links?.length) {
        const linkRows = links.map(l => ({ ...l, contact_id: data.id, client_id: Number(l.client_id) }))
        const { error: linkErr } = await supabase.from('contact_links').insert(linkRows)
        if (linkErr) throw linkErr
      }
      await syncContactEmails(data.id, payload.email, extra_emails)
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Contato criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, phones, links, extra_emails, contact_phones, contact_links, contact_emails: _old, ...payload }) => {
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
          const { error: linkErr } = await supabase.from('contact_links').insert(linkRows)
          if (linkErr) throw linkErr
        }
      }
      // Sincroniza contact_emails sempre que extra_emails é passado
      if (extra_emails !== undefined) {
        await syncContactEmails(id, payload.email ?? data.email, extra_emails)
      } else if (payload.email !== undefined) {
        // Só atualiza o e-mail primário sem tocar nos extras
        await supabase.from('contact_emails').delete().eq('contact_id', id).eq('is_primary', true)
        if (payload.email) {
          await supabase.from('contact_emails').insert({ contact_id: id, email: payload.email, type: 'work', is_primary: true })
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
