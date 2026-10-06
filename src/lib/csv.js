// Exportacao CSV para o Excel em portugues: separador ponto e virgula, decimal com
// virgula, BOM UTF-8 (acentos) e neutralizacao de celulas que o Excel lê como
// formula (=, +, -, @). O CSV sai exatamente com os dados da tela.

const SEP = ';'

export function celulaNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(2).replace('.', ',')
}

function celulaTexto(valor) {
  if (valor === null || valor === undefined) return ''
  let s = String(valor)
  // Texto que comeca com =, +, -, @ vira formula no Excel: prefixa com apostrofo.
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

// colunas: [{ titulo, campo, tipo: 'texto' | 'numero' }]
export function toCsv(linhas, colunas) {
  const cab = colunas.map(c => celulaTexto(c.titulo)).join(SEP)
  const corpo = linhas.map(l =>
    colunas.map(c => (c.tipo === 'numero' ? celulaNumero(l[c.campo]) : celulaTexto(l[c.campo]))).join(SEP)
  )
  return '﻿' + [cab, ...corpo].join('\r\n')
}

export function baixarCsv(nomeArquivo, conteudo) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Data e hora no fuso de Sao Paulo, para o nome do arquivo.
export function carimboData() {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`
}
