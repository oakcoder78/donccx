import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/Button'

function brDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

async function callRpc(name, args) {
  const { error } = await supabase.rpc(name, args)
  if (error) throw error
}

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border-tertiary rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text-primary">{title}</h3>
            {subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
            aria-label="Fechar"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Encerrar uma série é irreversível na aparência e por isso precisa explicar as
 * consequências: o que continua no histórico, o que some, e que dá para voltar.
 *
 * A opção de apagar os meses futuros e a de mantê-los são as duas reversíveis —
 * reabrir reconstrói a cauda pela ensure_series_horizon, que replica a última
 * linha de recorrência. A escolha é higiene de dado, não a dados.
 */
export function EncerrarSerieDialog({
  series,
  mesesFuturos = 0,
  motivo = null,
  onClose,
  onDone,
}) {
  const [remover, setRemover] = useState(true)
  const [comMulta, setComMulta] = useState(false)
  const [valorMulta, setValorMulta] = useState('')
  const [motivoMulta, setMotivoMulta] = useState('')
  const [textoMotivo, setTextoMotivo] = useState(motivo || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const label = series?.series_label || series?.label || 'série'
  const motivoCurto = motivoMulta.trim().length > 0 && motivoMulta.trim().length < 10
  // O motivo só é obrigatório onde já era obrigatório (o encerramento pelo form).
  // A partir do alerta de série vencida ele é opcional: o porquê já está no
  // próprio fato de a série ter parado de ser lançada.
  const motivoEncerramentoCurto =
    motivo !== null && textoMotivo.trim().length > 0 && textoMotivo.trim().length < 10

  async function confirmar() {
    setSalvando(true)
    setErro('')
    try {
      await callRpc('encerrar_series', {
        p_series_id: series.series_id,
        p_remover_futuro: remover,
        p_eventual: comMulta
          ? {
              amount: Number(valorMulta),
              label: 'Multa por cancelamento',
              reason: motivoMulta.trim() || null,
            }
          : null,
        p_motivo: textoMotivo.trim() || null,
      })
      // O form recebe o patch em vez de recarregar do banco: recarregar reescreve
      // as seções por-série todas e joga fora edições não salvas.
      // encerramento_motivo, e nao reason: reason descreve a serie (por que a
      // renegociacao existe) e sobrescrever o apagaria.
      onDone?.({
        status: 'encerrada',
        contract_renewal: null,
        encerramento_motivo: textoMotivo.trim() || null,
      })
    } catch (e) {
      setErro(e?.message || 'Falha ao encerrar a série')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      title={`Encerrar série "${label}"?`}
      subtitle="Ela para de ser lançada imediatamente."
      onClose={onClose}
    >
      <ul className="text-xs text-text-secondary space-y-1.5 mb-4">
        <li>· Meses vencidos e registrados como pagos ficam no histórico.</li>
        {mesesFuturos > 0 && (
          <li>
            · Restam <strong>{mesesFuturos} meses</strong> à frente que não serão
            cobrados.
          </li>
        )}
      </ul>

      {mesesFuturos > 0 && (
        <>
          <fieldset className="mb-4">
            <legend className="label-sm mb-1.5">O que fazer com os meses à frente?</legend>
            <label className="flex items-start gap-2 text-xs text-text-primary cursor-pointer mb-1.5">
              <input
                type="radio"
                name="futuro"
                checked={remover}
                onChange={() => setRemover(true)}
                className="mt-0.5"
              />
              <span>
                Cancelar e não registrar
                <span className="block text-text-tertiary">
                  Eram projeção, nunca foram contratados.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-text-primary cursor-pointer">
              <input
                type="radio"
                name="futuro"
                checked={!remover}
                onChange={() => setRemover(false)}
                className="mt-0.5"
              />
              <span>
                Manter como registro
                <span className="block text-text-tertiary">
                  Continuam no histórico como o que o contrato previa.
                </span>
              </span>
            </label>
          </fieldset>

          <p className="text-[11px] text-text-tertiary mb-4">
            As duas opções são reversíveis: reabrir a série reconstrói os meses à frente.
          </p>
        </>
      )}

      <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={comMulta}
          onChange={(e) => setComMulta(e.target.checked)}
        />
        Lançar multa ou ajuste como cobrança eventual
      </label>

      {motivo !== null && (
        <div className="mb-3">
          <label className="label-sm">
            Motivo {motivoEncerramentoCurto ? '*' : '(opcional)'}
          </label>
          <textarea
            value={textoMotivo}
            onChange={(e) => setTextoMotivo(e.target.value)}
            rows={2}
            className="input-base w-full resize-none"
            placeholder="Ex: contrato finalizado em comum acordo"
          />
        </div>
      )}

      {comMulta && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="label-sm">Valor</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={valorMulta}
              onChange={(e) => setValorMulta(e.target.value)}
              placeholder="0,00"
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="label-sm">Motivo</label>
            <input
              value={motivoMulta}
              onChange={(e) => setMotivoMulta(e.target.value)}
              placeholder="Cancelamento antecipado"
              className="input-base w-full"
            />
          </div>
        </div>
      )}

      {erro && (
        <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5 mb-3">
          {erro}
        </p>
      )}

      {motivoCurto && (
        <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5 mb-3">
          O motivo precisa de ao menos 10 caracteres, ou pode ficar em branco.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={salvando}>
          Voltar
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={confirmar}
          disabled={
            salvando ||
            (comMulta && (Number(valorMulta) <= 0 || motivoCurto)) ||
            motivoEncerramentoCurto
          }
        >
          {salvando ? 'Encerrando…' : 'Encerrar série'}
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Suspender cobrança é reversível, então o botão de confirmar é neutro e
 * `danger` fica reservado para encerrar série — as duas ações mudam o
 * faturamento e são fáceis de confundir, a cor é o que separa.
 *
 * O escopo não é óbvio, por isso a pergunta em vez de assumir "todas": suspender
 * uma série tira ela do faturamento sem tirar o cliente.
 */
export function NaoCobrarDialog({
  clientId,
  clientName,
  series = [],
  seriesAtivaId,
  onClose,
  onDone,
}) {
  const ativas = series.filter((s) => !s.status || s.status === 'ativa')
  const [escopo, setEscopo] = useState('todas')
  const [alvo, setAlvo] = useState(seriesAtivaId || ativas[0]?.id || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const podeEscolherSerie = ativas.length > 1

  async function confirmar() {
    setSalvando(true)
    setErro('')
    try {
      await callRpc('set_nao_cobrar', {
        p_client_id: clientId,
        p_series_id: escopo === 'serie' ? alvo : null,
      })
      // Escopo cliente-wide suspensa todas as séries ATIVAS; escopo série, só a
      // escolhida. Encerradas não são tocadas pela RPC, então o patch do form
      // só pode ser aplicado onde houve mudança — por isso `ativas`.
      onDone?.({
        ids: escopo === 'serie' ? [alvo] : ativas.map((s) => s.id),
      })
    } catch (e) {
      setErro(e?.message || 'Falha ao suspender a cobrança')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      title={escopo === 'serie' ? 'Suspender a cobrança desta série?' : 'Suspender a cobrança do cliente?'}
      subtitle={escopo === 'serie' ? `${clientName} · ${ativas.find((s) => s.id === alvo)?.label ?? ''}` : clientName}
      onClose={onClose}
    >
      <p className="text-xs text-text-secondary mb-3">
        Sai do faturamento enquanto estiver marcada. <strong>Não tem data de retorno</strong> — volta
        quando alguém desmarcar. Os meses já lançados ficam no histórico.
      </p>

      <fieldset className="mb-3">
        <label className="flex items-start gap-2 text-xs text-text-primary cursor-pointer mb-1.5">
          <input
            type="radio"
            name="escopo"
            checked={escopo === 'todas'}
            onChange={() => setEscopo('todas')}
            className="mt-0.5"
          />
          <span>
            Todas as séries
            <span className="block text-text-tertiary">
              {ativas.length > 0
                ? `${ativas.length} ${ativas.length === 1 ? 'série para' : 'séries param'} de ser lançada${ativas.length === 1 ? '' : 's'}.`
                : 'Todas param de ser lançadas.'}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-text-primary cursor-pointer">
          <input
            type="radio"
            name="escopo"
            checked={escopo === 'serie'}
            onChange={() => setEscopo('serie')}
            className="mt-0.5"
            disabled={!podeEscolherSerie}
          />
          <span>
            Só uma série
            <span className="block text-text-tertiary">
              {!podeEscolherSerie
                ? 'O cliente tem uma série só — as duas opções fazem a mesma coisa.'
                : 'As outras continuam sendo lançadas normalmente.'}
            </span>
          </span>
        </label>
      </fieldset>

      {escopo === 'serie' && podeEscolherSerie && (
        <div className="mb-3">
          <label className="label-sm">Qual série?</label>
          <select
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            className="input-base w-full"
          >
            {ativas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-[11px] text-text-tertiary mb-4">
        {escopo === 'todas' && ativas.length > 1
          ? 'Marcando todas, o cliente inteiro sai do faturamento. Com apenas uma série marcada, ele continua ativo.'
          : 'Para suspender várias séries de uma vez, use a lista de séries em vez deste diálogo.'}
      </p>

      {erro && (
        <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5 mb-3">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={salvando}>
          Voltar
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={confirmar}
          disabled={salvando || (escopo === 'serie' && !alvo)}
        >
          {salvando ? 'Aplicando…' : 'Suspender cobrança'}
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Continuar cobrando por um período antes de parar. Já existia como "Fim da
 * cobrança" no form, mas era undiscoverable: o caminho é desligar a renovação
 * automática e dar a data.
 *
 * A contagem é a partir de hoje, não do início do contrato — a série que chega
 * aqui já está vencida, e "mais 6 meses" significa os 6 meses que ainda vão
 * entrar, não uma data no passado.
 */
export function CobrarMaisMesesDialog({ series, onClose, onDone }) {
  const [meses, setMeses] = useState(6)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const fim = useMemo(() => {
    const hoje = new Date()
    // Último dia do mês N meses à frente, no fuso local do browser.
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + Number(meses) + 1, 0)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    return iso
  }, [meses])

  async function confirmar() {
    setSalvando(true)
    setErro('')
    try {
      await callRpc('cobrar_mais_meses', {
        p_series_id: series.series_id,
        p_meses: Number(meses),
      })
      onDone?.()
    } catch (e) {
      setErro(e?.message || 'Falha ao estender a cobrança')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      title="Cobrar mais N meses"
      subtitle={series?.client_name}
      onClose={onClose}
    >
      <p className="text-xs text-text-secondary mb-3">
        A série para de se renovar automaticamente e volta a ser lançada até a data escolhida.
        Ao chegar nela, ela entra no alerta de série vencida de novo.
      </p>

      <div className="flex items-end gap-3 mb-2">
        <div className="w-24">
          <label className="label-sm">Meses</label>
          <input
            type="number"
            min="1"
            max="120"
            value={meses}
            onChange={(e) => setMeses(Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
            className="input-base w-full"
          />
        </div>
        <p className="text-xs text-text-tertiary pb-2">Fatura até {brDate(fim)}</p>
      </div>

      {erro && (
        <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5 mb-3">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={salvando}>
          Voltar
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={confirmar} disabled={salvando || !fim}>
          {salvando ? 'Aplicando…' : 'Confirmar'}
        </Button>
      </div>
    </Modal>
  )
}