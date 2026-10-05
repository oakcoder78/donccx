import { Button } from './Button'

// Paginacao do Historico (SDD §4.4): 50 por página. Controlada: quem usa guarda
// a pagina. Mostra o intervalo e o total, para a pessoa saber o tamanho da lista.
export function Pagination({ page, pageSize = 50, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-sm text-text-secondary">
        {total === 0 ? 'Nenhum lançamento' : `Mostrando ${first} a ${last} de ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
          Anterior
        </Button>
        <span className="text-sm text-text-primary tabular-nums">Página {page} de {totalPages}</span>
        <Button variant="secondary" size="sm" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
          Próxima
        </Button>
      </div>
    </nav>
  )
}
