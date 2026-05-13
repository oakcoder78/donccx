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

    // 1. Busca como contato do cliente
    const { data: contact } = await sb
      .from('contacts')
      .select('id, nome, cargo, client_id')
      .eq('email', email)
      .eq('client_id', instance.client_id)
      .maybeSingle()

    // 2. Se não achou, busca como usuário interno do Hub
    const { data: profile } = (!contact)
      ? await sb.from('profiles').select('id, name, email').eq('email', email).maybeSingle()
      : { data: null }

    // 3. Valida: é contato do cliente OU usuário interno
    if (!contact && !profile) return err('E-mail não encontrado para este brief', 403)

    // 4. Determina origem e nome
    const isInternal = !!profile
    const userName = contact?.nome ?? profile?.name ?? email

    // 5. Trigger in_progress: só ativa se for contato (não usuário interno)
    if (action !== 'validate' && instance.status === 'sent' && !isInternal) {
      await sb.from('brief_instances')
        .update({ status: 'in_progress' })
        .eq('id', instance.id)
    }

    if (action === 'validate') {
      return ok({
        contact_name: userName,
        client_name: isInternal ? null : instance.clients.name,
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
        responded_by_name: userName,
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

      if (!isInternal) {
        await sb.from('activities').insert({
          client_id: instance.client_id,
          type: 'brief',
          title: `Brief "${instance.title}" respondido pelo cliente`,
          activity_date: new Date().toISOString(),
          responsible_id: instance.created_by,
        })
      }

      return ok({ completed: true })
    }

    if (action === 'get_attachment_urls') {
      const { paths } = payload
      if (!Array.isArray(paths) || paths.length === 0) return ok({ urls: {} })

      const urls: Record<string, string> = {}
      for (const path of paths) {
        try {
          const { data: signedUrl } = await sb.storage
            .from('project-briefs')
            .createSignedUrl(path, 3600)
          if (signedUrl) urls[path] = signedUrl
        } catch {
          // path not found or bucket issue — skip
        }
      }
      return ok({ urls, expires_at: Date.now() + 3600 * 1000 })
    }

    if (action === 'upload_attachment') {
      if (instance.status === 'completed') return err('Brief já concluído', 403)

      const { question_id, file_name, file_size, file_type, data_base64 } = payload
      if (!file_name || !file_size || !file_type || !data_base64)
        return err('Parâmetros incompletos', 400)

      const maxSize = 10 * 1024 * 1024
      if (file_size > maxSize) return err('Arquivo maior que 10MB', 400)

      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/zip',
      ]
      if (!allowedTypes.includes(file_type))
        return err('Tipo de arquivo não permitido', 400)

      const timestamp = Date.now()
      const safeName = file_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${instance.id}/${question_id || 'general'}/${timestamp}_${safeName}`

      const base64Data = data_base64.replace(/^data:[^,]+,/, '')
      const binary = atob(base64Data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const { error: uploadErr } = await sb.storage
        .from('project-briefs')
        .upload(path, bytes, { contentType: file_type })

      if (uploadErr) return err('Erro ao salvar arquivo: ' + uploadErr.message, 500)

      const uploaded_by = contact?.id ?? profile?.id
      const { error: insertErr } = await sb.from('brief_attachments').insert({
        instance_id: instance.id,
        question_id: question_id || null,
        file_name,
        file_size,
        file_type,
        mime_type: file_type,
        storage_path: path,
        uploaded_by,
      })

      if (insertErr) {
        await sb.storage.from('project-briefs').remove([path])
        return err('Erro ao registrar anexo: ' + insertErr.message, 500)
      }

      return ok({ saved: true, path })
    }

    if (action === 'delete_attachment') {
      if (instance.status === 'completed') return err('Brief já concluído', 403)

      const { attachment_id } = payload
      if (!attachment_id) return err('attachment_id requerido', 400)

      const { data: attachment } = await sb
        .from('brief_attachments')
        .select('*')
        .eq('id', attachment_id)
        .eq('instance_id', instance.id)
        .maybeSingle()

      if (!attachment) return err('Anexo não encontrado', 404)

      const ownerId = contact?.id ?? profile?.id
      if (attachment.uploaded_by !== ownerId) return err('Sem permissão', 403)

      await sb.storage.from('project-briefs').remove([attachment.storage_path])
      await sb.from('brief_attachments').delete().eq('id', attachment_id)

      return ok({ deleted: true })
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