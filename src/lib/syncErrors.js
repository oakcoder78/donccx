const KNOWN_ERRORS = {
  'schema "net" does not exist':
    'Sincronização automática desabilitada — extensão pg_net não instalada no banco.',
  'HTTP 401':
    'Falha de autenticação com a API DONC. Verifique as credenciais.',
  'HTTP 404':
    'Instância não encontrada na API DONC. Verifique o contrato_saas_id.',
  'HTTP 500':
    'Erro interno no servidor DONC. Tente novamente mais tarde.',
  'HTTP 502':
    'Gateway da API DONC indisponível. Tente novamente em alguns minutos.',
  'HTTP 503':
    'API DONC temporariamente indisponível. Tente novamente.',
  'ETIMEDOUT':
    'Tempo limite excedido ao conectar com a API DONC. Tente novamente.',
  'ENOTFOUND':
    'Servidor DONC não encontrado. Verifique a conectividade.',
  'Internal error':
    'Erro interno no servidor. Tente novamente ou contate o suporte.',
}

export function friendlyError(errorMessage) {
  if (!errorMessage) return 'Erro desconhecido.'
  for (const [pattern, friendly] of Object.entries(KNOWN_ERRORS)) {
    if (errorMessage.includes(pattern)) return friendly
  }
  return errorMessage
}
