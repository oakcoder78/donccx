# Plano: Considerações Finais + Usabilidade do Editor

## 1. Nova Seção "Considerações Finais"

**Tipo:** `custom-text` (mesmo do Contexto Externo: textarea livre com suporte a markdown)

**Arquivo:** `src/lib/reportGenerator.js:88`
```diff
+    { id: 'consideracoes_finais', type: 'custom-text',
+      title: 'Considerações Finais', enabled: true,
+      content: { text: '' }, extras: [] },
```

**Por que funciona:** O `slideCustomText` já renderiza `custom-text`, e o `SectionEditor` já mostra o textarea para `custom-text` (linha 834 da `ReportEditorPage.jsx`). Só precisa existir no `defaultSections()`.

---

## 2. Preview Ancorado na Seção Ativa

**Problema:** Cada edição regenera o HTML do iframe → perde scroll → usuário precisa rolar de volta.

**Solução em 3 partes:**

### 2a. Adicionar `id` nos slides do relatório

**Arquivo:** `src/lib/reportGenerator.js`
- Função `slide()` recebe parâmetro `sectionId` e adiciona `id="slide-{sectionId}"` na div principal.
- Cada função slide (`slideCapa`, `slideEscala`, etc.) passa o sectionId.

Ou mais simples: adicionar um `data-section-id` globalmente em cada slide.

### 2b. Incluir script de scroll no HTML do relatório

No HTML gerado, adicionar um snippet JS que escuta `postMessage`:

```js
window.addEventListener('message', (e) => {
  if (e.data?.type === 'scrollTo') {
    const el = document.getElementById(e.data.sectionId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
```

Incluir no lifecycle JS do relatório (ou no final do body, antes de fechar `</body>`).

### 2c. Editor envia postMessage para o iframe

**Arquivo:** `src/pages/ReportEditorPage.jsx`
- Adicionar `ref` no iframe
- `useEffect` monitora `html` + `activeSec?.id`: quando mudam, envia `postMessage({ type: 'scrollTo', sectionId: 'slide-' + activeSec.id }, '*')` para o iframe
- O iframe precisa de um pequeno delay (`setTimeout 100ms`) para o DOM renderizar antes do scroll

---

## 3. Botão Salvar Flutuante

**Problema:** Botão Salvar está no topo da página. Usuário precisa scrollar até lá.

**Solução:** Adicionar botão `fixed` no canto inferior direito, sempre visível.

**Arquivo:** `src/pages/ReportEditorPage.jsx`
- Adicionar `<button>` flutuante no final do componente (antes de fechar `</>` do fragmento principal):

```jsx
{/* Botão Salvar flutuante */}
<button
  onClick={handleSave}
  disabled={saving}
  className="fixed bottom-6 right-6 z-50 bg-donc-navy text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold hover:bg-donc-navy/90 transition-all"
>
  {saving ? <Spinner className="w-4 h-4" /> : <Icons.Save className="w-4 h-4" />}
  {saving ? 'Salvando…' : 'Salvar'}
</button>
```

- Manter também os botões existentes no topo (para acesso via header).
- Ou substituir o botão do header por este flutuante. Melhor manter ambos — o do header continua existindo, e o flutuante aparece para acesso rápido.

---

## Resumo de Arquivos e Mudanças

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `reportGenerator.js` | Adicionar `consideracoes_finais` em `defaultSections()` |
| 2 | `reportGenerator.js` | Adicionar `id` nos slides + script de `postMessage` listener |
| 3 | `ReportEditorPage.jsx` | Adicionar `useRef` no iframe + `useEffect` para scroll |
| 4 | `ReportEditorPage.jsx` | Adicionar botão Salvar flutuante `fixed` |
