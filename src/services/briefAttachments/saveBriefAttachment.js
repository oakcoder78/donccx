const BASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://etfeqblaeuhaobefxilp.supabase.co'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/zip',
]

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

async function callBrief(payload) {
  const res = await fetch(`${BASE_URL}/functions/v1/brief-public`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erro ao enviar anexo')
  return json
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function saveBriefAttachment({ token, email, questionId, file, instanceId }) {
  if (!file) return { success: false, error: 'Nenhum arquivo selecionado' }
  if (file.size > MAX_SIZE) return { success: false, error: 'Arquivo maior que 10MB' }
  if (!ALLOWED_TYPES.includes(file.type)) return { success: false, error: 'Tipo de arquivo não permitido' }

  const data_base64 = await toBase64(file)

  const result = await callBrief({
    action: 'upload_attachment',
    token,
    email,
    question_id: questionId,
    file_name: file.name,
    file_size: file.size,
    file_type: file.type,
    data_base64,
  })

  return {
    success: true,
    storage_path: result.path,
    file_name: file.name,
    file_size: file.size,
    file_type: file.type,
    question_id: questionId,
  }
}

export async function deleteBriefAttachment({ token, email, attachmentId }) {
  const res = await fetch(`${BASE_URL}/functions/v1/brief-public`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ action: 'delete_attachment', token, email, attachment_id: attachmentId }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erro ao remover anexo')
  return { success: true }
}