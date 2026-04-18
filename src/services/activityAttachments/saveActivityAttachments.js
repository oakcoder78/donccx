import { uploadActivityAttachments } from './uploadActivityAttachments'
import { insertActivityAttachments } from './insertActivityAttachments'
import { supabase } from '../../lib/supabaseClient'

/**
 * Orchestrates upload + database insert
 */

export async function saveActivityAttachments({
  activityId,
  clientId,
  userId,
  files
}) {

  // Step 1 — Upload files

  const uploadResult =
    await uploadActivityAttachments({
      activityId,
      clientId,
      userId,
      files
    })

  if (!uploadResult.success) {
    return uploadResult
  }

  // Step 2 — Insert database records

  const insertResult =
    await insertActivityAttachments({
      activityId,
      clientId,
      userId,
      files: uploadResult.files
    })

  if (!insertResult.success) {

    // Step 3 — Rollback uploaded files

    for (const file of uploadResult.files) {

      try {

        const { error } = await supabase
          .storage
          .from('activity-attachments')
          .remove([file.storage_path])

        if (error) {
          console.error(
            'Erro ao remover arquivo no rollback:',
            file.storage_path,
            error.message
          )
        }

      } catch (rollbackError) {

        console.error(
          'Falha inesperada no rollback:',
          file.storage_path,
          rollbackError
        )

      }

    }

    return insertResult

  }

  return {
    success: true,
    attachments: insertResult.data
  }

}