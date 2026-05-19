import { supabase } from '@/lib/supabaseClient'

export async function getActivityAttachments(activityId) {

  if (!activityId) {
    return {
      success: false,
      error: 'activityId obrigatório'
    }
  }

  const { data, error } = await supabase
    .from('activity_attachments')
    .select('*')
    .eq('activity_id', activityId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })

  if (error) {

    return {
      success: false,
      error: error.message
    }

  }

  return {
    success: true,
    data
  }

}