import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

function getContactEmail(contact) {
  if (!contact) return ''
  const emails = contact.contact_emails || []
  const primary = emails.find(e => e.is_primary)
  return primary?.email || contact.email || ''
}

export function useEmailBlastRecipients() {
  const [clientRows, setClientRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [clientsRes, activitiesRes] = await Promise.all([
          supabase
            .from('clients')
            .select(`
              id, name, fantasy_name,
              contact_links(
                contact_id, papel, champion,
                contacts(
                  id, name, email,
                  contact_emails(email, is_primary)
                )
              )
            `)
            .eq('contract_active', true)
            .order('name'),
          supabase
            .from('activities')
            .select('contact_id')
            .not('contact_id', 'is', null),
        ])

        if (cancelled) return

        if (clientsRes.error) throw clientsRes.error
        if (activitiesRes.error) throw activitiesRes.error

        const contactIdsWithActivities = new Set(
          (activitiesRes.data || []).map(r => r.contact_id)
        )

        const rows = (clientsRes.data || [])
          .map(client => {
            const contacts = (client.contact_links || [])
              .map(link => {
                const c = link.contacts
                return {
                  contactId: link.contact_id,
                  name: c?.name || '',
                  email: getContactEmail(c),
                  champion: !!link.champion,
                  papel: link.papel || '',
                  hasActivity: contactIdsWithActivities.has(link.contact_id),
                }
              })
              .filter(c => c.email)

            return {
              clientId: client.id,
              clientName: client.fantasy_name || client.name,
              contacts,
            }
          })
          .filter(c => c.contacts.length > 0)

        setClientRows(rows)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Erro ao carregar dados')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { clientRows, loading, error }
}
