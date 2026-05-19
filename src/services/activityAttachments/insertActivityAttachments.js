import { supabase } from '@/lib/supabaseClient'

/**
 * Insert attachment records into database
 */

export async function insertActivityAttachments({
  activityId,
  clientId,
  userId,
  files
}) {

  if (!files || files.length === 0) {
    return {
      success: false,
      error: 'Nenhum arquivo para registrar'
    }
  }

  const records = files.map(file => ({
    activity_id: activityId,
    client_id: clientId,
    uploaded_by: userId,
    file_name: file.file_name,
    file_size: file.file_size,
    file_type: file.file_type,
    storage_path: file.storage_path,
    is_deleted: false
  }))

  const { data, error } = await supabase
    .from('activity_attachments')
    .insert(records)
    .select()

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