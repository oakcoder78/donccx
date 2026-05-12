import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { action, token, email, ...payload } = await req.json()

    const { data: instance, error: instErr } = await sb
      .from('brief_instances')
      .select('*, clients(id, name)')
      .eq('access_token', token)
      .single()

    if (instErr || !instance) return err('Brief não encontrado', 404)
    if (instance.status === 'archived') return err('Brief encerrado', 403)
    if (instance.public_expires_at && new Date(instance.public_expires_at) < new Date())
      return err('Link expirado', 403)

    const { data: contact, error: contErr } = await sb
      .from('contacts')
      .select('id, nome, cargo')
      .eq('email', email)
      .eq('client_id', instance.client_id)
      .single()

    if (contErr || !contact) return err('E-mail não autorizado', 403)

    if (action !== 'validate' && instance.status === 'sent') {
      await sb.from('brief_instances')
        .update({ status: 'in_progress' })
        .eq('id', instance.id)
    }

    if (action === 'validate') {
      return ok({
        contact_name: contact.nome,
        client_name: instance.clients.name,
        instance: {
          id: instance.id,
          title: instance.title,
          status: instance.status,
          structure_snapshot: instance.structure_snapshot,
        }
      })
    }

    if (action === 'get') {
      const { data: responses } = await sb
        .from('brief_responses')
        .select('*')
        .eq('instance_id', instance.id)

      const { data: attachments } = await sb
        .from('brief_attachments')
        .select('*')
        .eq('instance_id', instance.id)

      return ok({ instance, responses: responses ?? [], attachments: attachments ?? [] })
    }

    if (action === 'save_response') {
      const { question_id, response_text } = payload
      const { error: saveErr } = await sb.from('brief_responses').upsert({
        instance_id: instance.id,
        question_id,
        response_text,
        responded_by_email: email,
        responded_by_name: contact.nome,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'instance_id,question_id' })

      if (saveErr) return err('Erro ao salvar resposta', 500)
      return ok({ saved: true })
    }

    if (action === 'complete') {
      await sb.from('brief_instances')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', instance.id)

      await sb.from('activities').insert({
        client_id: instance.client_id,
        activity_type: 'brief',
        description: `Brief "${instance.title}" respondido pelo cliente`,
        activity_date: new Date().toISOString(),
        responsible_id: instance.created_by,
      })

      return ok({ completed: true })
    }

    return err('Action inválida', 400)

  } catch (e) {
    return err(e.message ?? 'Erro interno', 500)
  }
})

const ok = (data: object) =>
  new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })

const err = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
