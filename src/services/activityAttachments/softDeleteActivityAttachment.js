import { supabase } from '@/lib/supabaseClient'

export async function softDeleteActivityAttachment(attachmentId) {
  if (!attachmentId) {
    return {
      success: false,
      error: 'attachmentId obrigatório'
    }
  }

  try {
    // First check if attachment exists
    const { data: existingAttachment, error: fetchError } = await supabase
      .from('activity_attachments')
      .select('id, is_deleted')
      .eq('id', attachmentId)
      .single()

    if (fetchError) {
      return {
        success: false,
        error: 'Anexo não encontrado'
      }
    }

    // If already deleted, return success (idempotent)
    if (existingAttachment && existingAttachment.is_deleted) {
      return {
        success: true
      }
    }

    // Update record to mark as deleted
    const { error } = await supabase
      .from('activity_attachments')
      .update({ is_deleted: true })
      .eq('id', attachmentId)

    if (error) {
      console.error('Erro ao marcar anexo como deletado:', error)
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true
    }
  } catch (error) {
    console.error('Erro inesperado ao deletar anexo:', error)
    return {
      success: false,
      error: 'Erro inesperado ao processar a exclusão'
    }
  }
}