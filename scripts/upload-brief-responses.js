/**
 * scripts/upload-brief-responses.js
 *
 * Faz upload das respostas do Discovery Técnico — Center Móveis
 * para a brief_instance do client_id=28.
 *
 * Uso:
 *   node scripts/upload-brief-responses.js --dry-run    # só mostra o que faria
 *   node scripts/upload-brief-responses.js --confirm    # upsert de verdade
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dir = fileURLToPath(new URL('.', import.meta.url))

// ── Carrega .env.local ────────────────────────────────────────────────────────
try {
  const content = readFileSync(resolve(__dir, '../.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key) process.env[key] = val
  }
} catch { /* ignorado */ }

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  VITE_SUPABASE_URL e SUPABASE_SECRET_KEY obrigatórios no .env.local')
  process.exit(1)
}

const isDryRun = process.argv.includes('--dry-run')
const isConfirm = process.argv.includes('--confirm')

if (!isDryRun && !isConfirm) {
  console.log('ℹ️  Use --dry-run para simular ou --confirm para executar.')
  process.exit(0)
}

// ── Cliente Supabase ───────────────────────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const CLIENT_ID = 28

// ── Respostas mapeadas do Discovery ────────────────────────────────────────────
// Só inclui perguntas que têm resposta no documento.
// As que estão "Sem resposta" no discovery ficam de fora.
const responses = [
  // ── S3: Fluxo de Entregas ─────────────────────────────────────────────────
  {
    question_id: 'q_1778778757857_aytee',
    response_text: `Processo ainda em definição pela Center Móveis.

As regras de comunicação com o cliente final serão detalhadas durante a configuração dos fluxos operacionais e automações da plataforma.

Pendente de definição pela Center Móveis`,
  },
  {
    question_id: 'q_1778778784295_a4ixz',
    response_text: `Os critérios de comprovação da entrega serão definidos através dos checklists operacionais que serão enviados posteriormente pela Center Móveis.

Os checklists serão configurados na plataforma por tipo de serviço.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },
  {
    question_id: 'q_1778778821127_xzn9p',
    response_text: `O profissional registrará a ocorrência através do aplicativo DONC.

A ocorrência ficará registrada no histórico e no status da ordem de serviço para análise da operação.

Eventuais reagendamentos ou novas execuções serão realizados através da criação de uma nova ordem de serviço no ERP, que posteriormente será enviada à DONC através da integração padrão.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },

  // ── S4: Fluxo de Montagens ────────────────────────────────────────────────
  {
    question_id: 'q_1778778964138_d9jut',
    response_text: `Operação híbrida. Existem equipes próprias e empresas terceirizadas. A distribuição das ordens de serviço é realizada pelo gestor da base, que decide para qual profissional ou parceiro encaminhar cada montagem.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },
  {
    question_id: 'q_1778778993591_susbd',
    response_text: `Atualmente a Center não realiza controle formal do tempo médio de montagem por categoria de produto.

Existem serviços que podem exigir apoio de ajudante. O apontamento dessa necessidade será realizado através da funcionalidade de ajudante disponível no aplicativo DONC.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },
  {
    question_id: 'q_1778779058324_ly0x3',
    response_text: `Uma montagem será considerada concluída mediante a execução integral do checklist configurado para o tipo de serviço e a correta finalização da ordem de serviço através do aplicativo DONC.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },
  {
    question_id: 'q_1778779144984_ou26h',
    response_text: `Neste primeiro momento os checklists serão definidos por tipo de serviço e não por tipo de produto.

A Center enviará posteriormente os modelos de checklist que deverão ser configurados na plataforma para cada serviço operacional.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },

  // ── S5: Fluxo de Assistências Técnicas ─────────────────────────────────────
  {
    question_id: 'q_1778779195058_2ckcw',
    response_text: `O cliente entra em contato com a Base Operacional, que realiza a abertura da ordem de serviço diretamente no Protheus.

Durante a execução de um serviço em campo, caso seja identificada a necessidade de assistência técnica, o profissional poderá registrar a solicitação através do aplicativo DONC. A informação será integrada ao Protheus para continuidade do processo operacional.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },
  {
    question_id: 'q_1778779544361_gdzsi',
    response_text: `Durante a execução da assistência ou montagem, o profissional poderá identificar problemas relacionados a produtos específicos e registrar a ocorrência através da plataforma.

A DONC possui suporte para gestão de peças e produtos, permitindo controlar ocorrências e necessidades de substituição quando aplicável.

O fluxo operacional detalhado de peças será validado durante a implantação.

Consolidado após treinamento e alinhamentos internos · 17/06/2026`,
  },

  // ── S7: Integração e origem dos dados ─────────────────────────────────────
  {
    question_id: 'q_1778781436073_nwt0b',
    response_text: `Protheus

Consolidado após discovery e treinamento · 17/06/2026`,
  },
  {
    question_id: 'q_1778781580423_twouy',
    response_text: `Adolfo Fernandes (gestaosistemas@centermoveiseeletros.com.br)

Consolidado após discovery e treinamento · 17/06/2026`,
  },

  // ── S1: Estratégico — Resp. estratégico marcado como "Sem resposta" ──────
  {
    question_id: 'q_1778778543813_wtris',
    response_text: '—',
  },
]

// ── Execução ───────────────────────────────────────────────────────────────────
async function main() {
  // 1. Busca a brief_instance
  const { data: instances, error: instErr } = await sb
    .from('brief_instances')
    .select('id, title, status')
    .eq('client_id', CLIENT_ID)

  if (instErr) { console.error('❌  Erro ao buscar instances:', instErr.message); process.exit(1) }
  if (!instances.length) { console.error('❌  Nenhuma brief_instance encontrada para client_id=28'); process.exit(1) }

  const instance = instances[0]
  console.log(`📋  Instance: ${instance.title}`)
  console.log(`   ID: ${instance.id}`)
  console.log(`   Status: ${instance.status}`)
  console.log()

  // 2. Busca respostas já existentes
  const { data: existing } = await sb
    .from('brief_responses')
    .select('question_id, response_text, responded_by_email')
    .eq('instance_id', instance.id)

  const existingMap = new Map(existing.map(r => [r.question_id, r]))

  // 3. Filtra apenas as que ainda não foram respondidas (ou são do CSM)
  const toUpsert = []
  for (const r of responses) {
    const exist = existingMap.get(r.question_id)
    if (exist && exist.responded_by_email !== 'csm' && exist.response_text && exist.response_text.trim()) {
      console.log(`⏭️   ${r.question_id} — já respondido por ${exist.responded_by_email}, pulando`)
      continue
    }
    toUpsert.push({
      instance_id: instance.id,
      question_id: r.question_id,
      response_text: r.response_text,
      responded_by_email: 'csm',
      responded_by_name: 'CSM (pré-preenchimento)',
    })
  }

  if (!toUpsert.length) {
    console.log('\n✅  Nada a fazer — todas as respostas já existem.')
    process.exit(0)
  }

  console.log(`\n📝  ${toUpsert.length} respostas a serem upsertadas:\n`)
  for (const r of toUpsert) {
    const preview = r.response_text.replace(/\n/g, ' ').substring(0, 80)
    console.log(`   • ${r.question_id}: ${preview}...`)
  }

  if (isDryRun) {
    console.log('\n🚫  --dry-run ativo. Nenhuma alteração foi feita.')
    console.log('    Execute com --confirm para aplicar.')
    process.exit(0)
  }

  // 4. Upsert em lote
  const { error: upsErr } = await sb
    .from('brief_responses')
    .upsert(toUpsert, { onConflict: 'instance_id,question_id' })

  if (upsErr) {
    console.error('\n❌  Erro no upsert:', upsErr.message)
    process.exit(1)
  }

  console.log(`\n✅  ${toUpsert.length} respostas upsertadas com sucesso!`)
}

main()
