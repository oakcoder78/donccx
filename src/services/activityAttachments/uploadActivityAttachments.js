import { supabase } from '../../lib/supabaseClient'

export async function uploadActivityAttachments({
  activityId,
  clientId,
  userId,
  files
}) {

  if (!files || files.length === 0) {
    return {
      success: false,
      error: 'Nenhum arquivo enviado'
    }
  }

  if (files.length > 5) {
    return {
      success: false,
      error: 'Máximo de 5 arquivos permitido'
    }
  }

  const uploadedFiles = []

  for (const file of files) {

    try {

      const timestamp =
  `${Date.now()}_${Math.floor(Math.random() * 1000)}`

      const safeName = file.name
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9._-]/g, "_")

      const storagePath =
        `${clientId}/${activityId}/${timestamp}_${safeName}`

      const { error } = await supabase
        .storage
        .from('activity-attachments')
        .upload(storagePath, file)

      if (error) {
        throw error
      }

      uploadedFiles.push({
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: storagePath
      })

    } catch (err) {

      return {
        success: false,
        error: `Erro ao enviar arquivo: ${err.message}`
      }

    }

  }

  return {
    success: true,
    files: uploadedFiles
  }
}
