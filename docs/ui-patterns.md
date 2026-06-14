# UI Pattern Library — doncCX Hub

> **Purpose:** Define the exact Tailwind classes for every reusable visual pattern. LLM agents (and human developers) must follow these patterns when building or modifying UI. No guessing.

---

## 1. Table Pattern

Used in: CS Radar, Health Dashboard, Project Cockpit, Settings (Fase Types, Brief Templates).

### Structure
```jsx
<div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
  <div className="overflow-x-auto w-full">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-donc-navy text-white text-xs uppercase tracking-wider">
          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Header</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-border-tertiary transition-colors hover:bg-bg-secondary">
          <td className="px-4 py-2.5">Value</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

### Element Reference

| Element | Classes | Notes |
|---------|---------|-------|
| Container | `bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden` | Always `rounded-lg`, not `rounded-xl` |
| Scroll wrapper | `overflow-x-auto w-full` | Required for responsive tables |
| `<table>` | `w-full text-sm` | |
| `<thead>` `<tr>` | `bg-donc-navy text-white text-xs uppercase tracking-wider` | |
| `<th>` | `px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white` | Override alignment with `text-right` or `text-center` when needed |
| `<tbody>` `<tr>` | `border-b border-border-tertiary transition-colors hover:bg-bg-secondary` | Add `last:border-b-0` when border on last row is undesirable |
| `<td>` | `px-4 py-2.5` | Add column-specific colors/weights as inline `style` or extra classes |
| Empty state `<td>` | `text-center py-12 text-text-tertiary text-sm px-4` | `colSpan` = number of columns |

### Row Click Handler
```jsx
<tr
  onClick={() => handleClick(item.id)}
  className="border-b border-border-tertiary transition-colors hover:bg-bg-secondary cursor-pointer"
>
```

### When NOT to use `<table>` (div grid)

Some dashboards use `<div>` with CSS Grid instead of `<table>`:
- Layouts with complex column interactions (e.g., nested elements spanning multiple logical columns)
- Scorecards or KPI grids
- Always prefer `<table>` for tabular data. Only use CSS Grid when presentation differs fundamentally from tabular structure.

---

## 2. Toggle Switch Pattern

Used in: Settings (Fase Types, Brief Templates), Project Cockpit (show completed toggle).

### Structure
```jsx
<div
  className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer"
  role="switch"
  aria-checked={enabled}
  onClick={() => setEnabled(!enabled)}
  style={{ backgroundColor: enabled ? '#173557' : '#d4d3ce' }}
>
  <span
    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
  />
</div>
```

### Element Reference

| Element | Classes | Notes |
|---------|---------|-------|
| Track | `relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer` | |
| Track ON | `style={{ backgroundColor: '#173557' }}` | Same as `bg-donc-navy` |
| Track OFF | `style={{ backgroundColor: '#d4d3ce' }}` | Or `bg-border-secondary` |
| Knob | `inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform` | |
| Knob ON | `translate-x-[18px]` | |
| Knob OFF | `translate-x-[2px]` | |
| Accessibility | `role="switch"` + `aria-checked={enabled}` | Required |

### With label
```jsx
<label className="flex items-center gap-2 text-xs text-text-tertiary cursor-pointer select-none">
  <Toggle value={checked} onChange={setChecked} />
  Label text
</label>
```

---

## 3. Badge / Pill Pattern

Used in: Activity status (concluída/pendente/em_andamento), CS Radar semaphore, Health Score bands, Settings tags.

### Structure
```jsx
<span className="text-xs px-2 py-0.5 rounded-full font-medium inline-block text-center bg-{variant}-soft text-{variant}">
  Label
</span>
```

### Fixed Width (inside grid columns)
When badges are inside CSS Grid columns, use `display: block` so all badges have the same width regardless of text length:
```jsx
<span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 6px', borderRadius: 999, textAlign: 'center', display: 'block', background: pillBg, color }}>
  {label}
</span>
```

### Color Variants

| Variant | Background | Text | Usage |
|---------|-----------|------|-------|
| Green | `bg-donc-verde/10` | `text-donc-verde` | Saudável, concluída, success |
| Amber | `bg-donc-amber/10` | `text-donc-amber` | Atenção, em_andamento, warning |
| Red | `bg-donc-red/10` | `text-donc-red` | Alerta, atrasada, error |
| Sky | `bg-donc-sky/10` | `text-donc-sky` | Info, highlight |
| Slate | `bg-bg-secondary` | `text-text-tertiary` | Neutral, disabled |
| Navy | `bg-donc-navy/10` | `text-donc-navy` | Primary tag |

---

## 4. Progress Bar Pattern

Used in: Health Dashboard (dimension bars), Project Cockpit (project progress), milestone progress.

### Structure
```jsx
<div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
  <div
    className="h-full rounded-full transition-all"
    style={{ width: `${pct}%`, backgroundColor: barColor }}
  />
</div>
```

### Color by Value

| Range | Color | Meaning |
|-------|-------|---------|
| ≥ 80% | `#2f9e70` (green) | High / on track |
| 40–79% | `#d98b28` (amber) | Medium / attention |
| < 40% | `#d64545` (red) | Low / alert |

For dimension scores (0–20 scale):
- ≥ 20: full green
- < 20: proportionally colored

For the `HealthBar` component (auto-color):
```jsx
<HealthBar value={score} max={20} />
```

---

## 5. Card Pattern

### Default Card
```jsx
<div className="bg-bg-primary border border-border-tertiary rounded-lg p-5">
  {children}
</div>
```

### Card with Header
```jsx
<div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
  <div className="px-5 py-3 border-b border-border-tertiary">
    <h3 className="text-sm font-semibold text-text-primary">Title</h3>
  </div>
  <div className="p-5">
    {children}
  </div>
</div>
```

### Card with Table (see Table Pattern)
Tables use `rounded-lg overflow-hidden` on the container, no extra padding — the table fills the entire card.

---

## 6. Scorecard / KPI Card Pattern

Used in: Health Dashboard, CS Radar.

```jsx
<div className="bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4">
  <div className="flex items-center gap-2.5">
    <div className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center`}>
      <Icon className={`w-5 h-5 ${color.text}`} />
    </div>
    <div>
      <div className="text-2xl font-bold text-text-primary leading-tight tabular-nums">
        {value ?? '—'}
      </div>
      <div className="text-xs text-text-tertiary font-medium mt-0.5">{label}</div>
    </div>
  </div>
</div>
```

---

## 7. Loading Skeleton Pattern

Used in: All pages during data fetch.

### Table Skeleton
Replace `<tbody>` content with pulsing divs that match the table structure:
```jsx
<tr className="animate-pulse">
  <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>
  <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded w-2/3" /></td>
  <td className="px-4 py-2.5"><div className="h-5 bg-bg-secondary rounded" /></td>
  {extraColumns.map(d => <td key={d} className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>)}
</tr>
```

### Card Skeleton
```jsx
<div className="animate-pulse" style={{ background: C.surface, borderRadius: 10, padding: '20px 24px', height: 90, border: `1px solid ${C.line}` }}>
  <div style={{ height: 32, width: '55%', background: '#e8ecf0', borderRadius: 6, marginBottom: 10 }} />
  <div style={{ height: 12, width: '40%', background: '#e8ecf0', borderRadius: 4 }} />
</div>
```

### Rules
- Always use `animate-pulse` on the container
- Use `bg-bg-secondary` (`#e8ecf0`) for skeleton elements
- Match dimensions (height, width) to the real content being replaced
- Use `rounded` for bars, `rounded-full` for circles

---

## 8. Empty State Pattern

```jsx
<tr>
  <td colSpan={N} className="text-center py-12 text-text-tertiary text-sm px-4">
    {message}
  </td>
</tr>
```

For non-table contexts:
```jsx
<div className="text-center py-12 text-text-tertiary text-sm">
  Nenhum item encontrado
</div>
```

---

## 9. Error State Pattern

```jsx
<div className="max-w-5xl mx-auto px-6 py-8">
  <div className="text-center py-12 text-text-tertiary">
    <p className="mb-3 text-sm">Erro ao carregar dados</p>
    <button
      onClick={() => window.location.reload()}
      className="text-sm text-donc-sky hover:underline bg-none border-none cursor-pointer"
    >
      Tentar novamente
    </button>
  </div>
</div>
```

---

## 10. Page Layout Pattern

```jsx
<div className="max-w-5xl mx-auto px-6 py-8">
  <PageHeader title="Page Title" subtitle="Optional subtitle" />
  {/* Section 1 */}
  <div className="mb-6">
    ...
  </div>
  {/* Section 2 */}
  <div className="mb-6">
    ...
  </div>
</div>
```

### PageHeader action prop
```jsx
<PageHeader
  title="Page Title"
  subtitle="Subtitle"
  action={
    <button className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors px-3 py-1.5 rounded-md border border-border-secondary bg-bg-primary">
      <Icons.HelpCircle size={14} />
      Action label
    </button>
  }
/>
```

---

## 11. Form Input Pattern

Used in: Filters, Settings forms.

```jsx
<input
  type="text"
  value={value}
  onChange={handleChange}
  placeholder="Placeholder..."
  className="input-base h-9"
  style={{ width: 240 }}
/>
```

```jsx
<select
  value={value}
  onChange={handleChange}
  className="input-base h-9"
  style={{ minWidth: 140 }}
>
  <option value="">All options</option>
  {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
</select>
```

---

## 12. Band Chip Pattern

Used in: Health Dashboard (Saudáveis/Atenção/Alerta), generic filter chips.

```jsx
<div className="flex flex-wrap gap-2">
  {chips.map(chip => (
    <button
      key={chip.key}
      onClick={() => setActive(chip.key)}
      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
        active === chip.key
          ? 'bg-donc-navy text-white'
          : 'bg-transparent text-text-tertiary border border-border-secondary'
      }`}
    >
      {chip.label}
    </button>
  ))}
</div>
```

---

## 13. Color Palette Reference

### Brand Colors

| Token | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| Navy | `#173557` | `bg-donc-navy` | Table headers, toggle ON, primary buttons, active chips |
| Sky | `#59c2ed` | `bg-donc-sky` | Highlights, heatmap, dimension Uso, accent links |
| Green | `#2f9e70` | `bg-donc-verde` | Success, Saudável, progress >80% |
| Amber | `#d98b28` | `bg-donc-amber` | Warning, Atenção, progress 40-80% |
| Red | `#d64545` | `bg-donc-red` | Error, Alerta, progress <40% |
| Purple | `#b46cd1` | `bg-donc-purple` | Dimension Suporte, accent |
| Lime | `#d3da47` | — | Dimension Projeto |
| White | `#ffffff` | `bg-white` | Toggle knob, text on navy |

### Semantic Tokens

| Token | Equivalent | Usage |
|-------|------------|-------|
| `bg-bg-primary` | `#ffffff` | Card backgrounds, table backgrounds, page surface |
| `bg-bg-secondary` | `#f4f5f7` | Skeleton loading, hover state, header background (legacy) |
| `text-text-primary` | `#1a1a18` / `#0e223a` | Primary text, headings |
| `text-text-secondary` | `#3b4a5e` | Secondary text, body content |
| `text-text-tertiary` | `#6b7889` / `#888780` | Hints, labels, metadata, disabled |
| `border-border-secondary` | — | Input borders, subtle dividers |
| `border-border-tertiary` | `rgba(15,34,58,0.09)` | Card borders, table row dividers |

### Dimension Colors (Health Score)

| Dimension | Hex | Variable |
|-----------|-----|----------|
| Uso | `#59c2ed` | `C.dimUso` / `DIM_COLORS.health_uso` |
| Suporte | `#b46cd1` | `C.dimSuporte` / `DIM_COLORS.health_suporte` |
| Relacionamento | `#d98b28` | `C.dimRel` / `DIM_COLORS.health_relacionamento` |
| Financeiro | `#2f9e70` | `C.dimFin` / `DIM_COLORS.health_financeiro` |
| Projeto | `#d3da47` | `C.dimProj` / `DIM_COLORS.health_projeto` |

---

## 14. Overlay / Modal Pattern

```jsx
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4" onClick={onClose}>
    <div className="bg-bg-primary border border-border-tertiary rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-tertiary flex-shrink-0">
        <h2 className="text-base font-semibold text-text-primary">Title</h2>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
          <Icons.X size={18} />
        </button>
      </div>
      <div className="px-6 py-5 overflow-y-auto">
        {children}
      </div>
    </div>
  </div>
)}
```

---

## 15. Health Score Legend Pattern

Used in: Health Dashboard (between chips and table).

```jsx
<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary mb-3">
  <span className="flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full bg-donc-verde" />
    Saudável (≥{threshold})
  </span>
  <span className="flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full bg-donc-amber" />
    Atenção (≥{threshold})
  </span>
  <span className="flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full bg-donc-red" />
    Alerta (&lt;{threshold})
  </span>
  <span className="text-border-tertiary hidden sm:inline">|</span>
  <span className="hidden sm:inline-flex items-center gap-1">
    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dimColor }} />
    Dim
  </span>
</div>
```

---

## 16. Side Panel (Drawer) Pattern

Used in: Health Dashboard (client detail), CS Radar (future).

```jsx
<aside style={{
  position: 'fixed', top: 0, right: 0, height: '100vh', width: 380,
  background: C.surface, borderLeft: `0.5px solid ${C.line}`,
  zIndex: 50, display: 'flex', flexDirection: 'column',
  transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
  transition: 'transform 0.3s cubic-bezier(.3,.7,.3,1)',
}}>
  {isOpen && children}
</aside>
```

Page padding adjusts when drawer is open:
```jsx
<div style={{ paddingRight: isOpen ? 380 : 0, transition: 'padding-right 0.3s ease' }}>
```

---

## 17. Keyboard Navigation

| Key | Action | Used in |
|-----|--------|---------|
| `Escape` | Close drawer/modal | Health Dashboard, CS Radar |
| `ArrowLeft` | Navigate back | Project Cockpit |

Implement via `useEffect`:
```jsx
useEffect(() => {
  const onKey = e => { if (e.key === 'Escape') onClose() }
  if (isOpen) window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [isOpen])
```

---

## 18. Button Pattern

Used in: All pages. Component: `src/components/ui/Button.jsx`.

### Variants
```jsx
const variants = {
  primary:   'bg-donc-navy text-white hover:bg-donc-navy/90',
  secondary: 'bg-bg-tertiary text-text-primary border border-border-tertiary hover:bg-bg-tertiary/70',
  green:     'bg-donc-verde text-white hover:bg-donc-verde/90',
  danger:    'bg-donc-red text-white hover:bg-donc-red/90',
  ghost:     'text-text-secondary hover:bg-bg-tertiary',
}
```

### Sizes
```jsx
const sizes = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}
```

### Usage
```jsx
import { Button } from '../components/ui/Button'

<Button variant="primary" size="md" onClick={handle}>Salvar</Button>
<Button variant="secondary" size="sm">Cancelar</Button>
<Button variant="green" size="xs">Aprovar</Button>
<Button variant="danger" size="md" disabled>Excluir</Button>
<Button variant="ghost" size="sm"><Icons.Edit size={14} /> Editar</Button>
```

### Classes Generated
Always: `inline-flex items-center gap-2 font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`

| Variant | Added Classes |
|---------|--------------|
| primary | `bg-donc-navy text-white hover:bg-donc-navy/90` |
| secondary | `bg-bg-tertiary text-text-primary border border-border-tertiary hover:bg-bg-tertiary/70` |
| green | `bg-donc-verde text-white hover:bg-donc-verde/90` |
| danger | `bg-donc-red text-white hover:bg-donc-red/90` |
| ghost | `text-text-secondary hover:bg-bg-tertiary` |

### Inline action button (non-component variant)
For small inline actions without importing Button:
```jsx
<button className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors px-3 py-1.5 rounded-md border border-border-secondary bg-bg-primary">
  <Icons.HelpCircle size={14} />
  Label
</button>
```

---

## 19. Avatar Pattern

Used in: Navbar, Contacts, Settings Users, list items. Component: `src/components/ui/Avatar.jsx`.

### Structure
```jsx
import { Avatar } from '../components/ui/Avatar'

<Avatar name={profile.name} size="md" />
<Avatar name="John Doe" size="sm" className="ring-2 ring-white" />
<Avatar name="Maria Silva" size="xl" />
```

### Sizes
| Size | Classes |
|------|---------|
| `sm` | `w-7 h-7 text-xs` |
| `md` | `w-9 h-9 text-sm` |
| `lg` | `w-12 h-12 text-base` |
| `xl` | `w-16 h-16 text-xl` |

### Behavior
- Always renders initials (first 2 name parts, uppercased) — no image support
- Background color is deterministic: hash function picks from 8 colors: `#173557`, `#59c2ed`, `#1D9E75`, `#BA7517`, `#534AB7`, `#185FA5`, `#0091AE`, `#E24B4A`
- Root classes: `rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`
- Always uses `<div>` not `<img>`

### With image (override)
When an avatar URL exists, inline the image directly:
```jsx
{profile.avatar_url
  ? <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: 'rgba(23,53,87,0.15)' }}>
      <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
    </div>
  : <Avatar name={profile.name} size="sm" />
}
```

---

## 20. Search Input Pattern — Padrão

Used in: All list pages (CsRadar, HealthDashboard, ActivitiesPage, ContactsPage, ClientsPage, SettingsEmailBlast, OnboardingDetailPage).

### Structure (padrão único)
```jsx
<div className="relative">
  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
  <input
    type="text"
    value={search}
    onChange={e => setSearch(e.target.value)}
    placeholder="..."
    className="w-full pl-9 pr-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary text-text-primary placeholder:text-text-tertiary"
  />
</div>
```

O container `relative` aceita classes de largura adicionais por contexto (`max-w-sm`, `flex-1 min-w-[160px] max-w-[240px]`, etc). A altura compacta (`py-1.5 text-sm`) é aceitável em filter bars com múltiplos selects.

### Input Classes Reference
| Property | Classes |
|----------|---------|
| Container | `relative` |
| Icon | `Icons.Search` com `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none` |
| Input | `w-full pl-9 pr-3 py-2 border border-border-secondary rounded-md text-sm` |
| Focus | `focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky` |
| Text | `bg-bg-primary text-text-primary` |
| Placeholder | `placeholder:text-text-tertiary` |

---

## 21. Filter Bar Pattern

Used in: ActivitiesPage, CS Radar, ProjectsPage, ClientTabActivities.

### Structure
A filter bar combines selects, search, and a clear button in a flex-wrap row:
```jsx
<div className="flex items-center gap-3 mb-5 flex-wrap">
  <span className="text-xs text-text-tertiary">Filtrar por:</span>

  <select className="px-3 py-1.5 text-xs border border-border-secondary rounded-md bg-bg-primary hover:border-text-tertiary transition-colors">
    <option value="">Todos os clientes</option>
  </select>

  <div className="relative flex-1 min-w-[160px] max-w-[240px]">
    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
    <input className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky placeholder:text-text-tertiary" />
  </div>

  <button className="text-xs text-text-tertiary hover:text-text-primary underline">
    Limpar filtros
  </button>
</div>
```

### Select Classes Reference (all variants)
```jsx
// Default (activities, tab activities, logs):
className="px-3 py-1.5 text-xs border border-border-secondary rounded-md bg-bg-primary hover:border-text-tertiary transition-colors"

// Larger (CS Radar):
className="px-3 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary outline-none focus:border-donc-sky"

// ProjectsPage (extracted constant):
const SELECT_CLS = 'px-3 py-1.5 text-xs border border-border-secondary rounded-md bg-bg-primary hover:border-text-tertiary transition-colors'
```

### Label + Checkbox inline filter (ClientTabActivities)
```jsx
<label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
  <input type="checkbox" className="rounded border-border-tertiary" /> Minhas atividades
</label>
```

### CS Radar MultiSelect (custom checkbox dropdown)
```jsx
<div className="relative" ref={ref}>
  <button type="button" onClick={() => setOpen(!open)}
    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary outline-none hover:border-border-secondary/80 focus:border-donc-sky whitespace-nowrap">
    <span className="truncate max-w-[120px]">{displayText}</span>
    <Icons.ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
  {open && (
    <div className="absolute top-full left-0 mt-1 bg-bg-primary border border-border-tertiary rounded-lg shadow-lg z-30 py-1 min-w-[180px] max-h-[260px] overflow-y-auto">
      <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-secondary cursor-pointer text-sm text-text-primary">
        <input type="checkbox" className="accent-donc-sky" /> {opt.label}
      </label>
    </div>
  )}
</div>
```

---

## 22. Tab / Segmented Control Pattern

Used in: ActivitiesPage, ClientDetail, ProjectCockpit sub-tabs, Settings sidebar.

### Variation A — Border-bottom tab bar (ActivitiesPage, ClientDetail)
```jsx
<div className="flex gap-0 border-b-2 border-border-tertiary mb-4 overflow-x-auto">
  {TABS.map(t => (
    <button
      key={t.key}
      onClick={() => setTab(t.key)}
      className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-0.5 ${
        tab === t.key
          ? 'text-donc-hubspot border-donc-hubspot'
          : 'text-text-tertiary border-transparent hover:text-text-primary'
      }`}
    >
      {t.label}
    </button>
  ))}
</div>
```

**ClientDetail navy variant:**
```jsx
<div className="flex gap-0 border-b border-border-tertiary mt-4 mb-5 overflow-x-auto">
  <button className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
    tab === t.key
      ? 'text-donc-navy border-donc-navy'
      : isDisabledTab
        ? 'text-text-tertiary/40 cursor-not-allowed'
        : 'text-text-tertiary border-transparent hover:text-text-primary'
  }`} disabled={isDisabledTab}>
    {t.label}
  </button>
</div>
```

### Variation B — Rounded sub-tabs (ProjectCockpit)
```jsx
<div className="flex gap-1 border-b border-border-tertiary pb-2">
  <button className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
    activeProj.id === proj.id
      ? 'bg-donc-sky/10 text-donc-sky'
      : 'text-text-tertiary hover:text-text-secondary'
  }`}>
    {proj.title}
  </button>
</div>
```

### Variation C — Settings sidebar navigation
```jsx
<aside className="w-64 bg-bg-primary border-r border-border-tertiary p-3 flex-shrink-0">
  <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-3">Configurações</p>
  <nav className="space-y-4">
    {MENU.map(group => (
      <div key={group.label}>
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-3 mb-1">{group.label}</p>
        {group.items.map(item => (
          <button
            key={item.key}
            onClick={() => setSection(item.key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              section === item.key
                ? 'bg-donc-navy text-white'
                : 'text-text-secondary hover:bg-bg-secondary'
            }`}
          >
            <MenuIcon className="w-4 h-4 flex-shrink-0" />
            {item.label}
          </button>
        ))}
      </div>
    ))}
  </nav>
</aside>
```

### Tab Bar Reference
| Property | Border-bottom (ActivitiesPage) | Border-bottom (ClientDetail) | Rounded sub-tabs | Sidebar nav |
|----------|-------------------------------|------------------------------|------------------|-------------|
| Container | `flex gap-0 border-b-2 border-border-tertiary overflow-x-auto` | `flex gap-0 border-b border-border-tertiary overflow-x-auto` | `flex gap-1 border-b border-border-tertiary pb-2` | `space-y-4` |
| Inactive | `text-text-tertiary border-transparent hover:text-text-primary` | `text-text-tertiary border-transparent hover:text-text-primary` | `text-text-tertiary hover:text-text-secondary` | `text-text-secondary hover:bg-bg-secondary` |
| Active | `text-donc-hubspot border-donc-hubspot` | `text-donc-navy border-donc-navy` | `bg-donc-sky/10 text-donc-sky` | `bg-donc-navy text-white` |
| Active indicator | `border-b-2 -mb-0.5` | `border-b-2 -mb-px` | `rounded-md` | `rounded-md` |
| Disabled | — | `text-text-tertiary/40 cursor-not-allowed` | — | — |

---

## 23. Confirmation Dialog Pattern

Used in: All destructive operations (delete, remove, archive).

### Pattern A — `window.confirm()` (25+ locations)
Simple boolean, no styling, for quick confirmations:
```jsx
if (!window.confirm('Excluir esta atividade?')) return
if (!confirm(`Remover "${item.name}"?`)) return
```
Only for single-step confirmations. For richer UX, use custom modal (Pattern B).

### Pattern B — Custom confirmation modal
```jsx
{confirmDelete && (
  <div
    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    onClick={() => setConfirmDelete(null)}
  >
    <div
      className="bg-bg-primary rounded-xl w-full flex flex-col overflow-hidden shadow-2xl"
      style={{ maxWidth: 400 }}
      onClick={e => e.stopPropagation()}
    >
      <div className="p-5">
        {/* Icon + Title */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Icons.XCircle size={20} className="text-red-500" />
          </div>
          <h3 className="text-base font-bold text-text-primary">Remover item?</h3>
        </div>
        {/* Description */}
        <p className="text-sm text-text-secondary mb-4">Description of consequences...</p>
        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmDelete(null)}
            className="flex-1 text-xs px-3 py-2 rounded-lg border border-border-tertiary text-text-secondary hover:bg-bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmAction}
            className="flex-1 text-xs px-3 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  </div>
)}
```

### Structure Reference
| Element | Classes / Style |
|---------|----------------|
| Backdrop | `fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4` |
| Container | `bg-bg-primary rounded-xl flex flex-col overflow-hidden shadow-2xl` |
| Max width | inline `style={{ maxWidth: 400 }}` |
| Icon circle | `w-10 h-10 rounded-full bg-red-100 flex items-center justify-center` |
| Icon | `Icons.XCircle size={20}` with `text-red-500` |
| Title | `text-base font-bold text-text-primary` |
| Description | `text-sm text-text-secondary` |
| Cancel button | `flex-1 text-xs px-3 py-2 rounded-lg border border-border-tertiary text-text-secondary hover:bg-bg-secondary` |
| Confirm button | `flex-1 text-xs px-3 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600` |

### Colors by Severity
| Severity | Icon bg | Icon | Confirm button |
|----------|---------|------|----------------|
| Danger (delete) | `bg-red-100` | `text-red-500` | `bg-red-500 hover:bg-red-600` |
| Warning | `bg-amber-100` | `text-amber-500` | `bg-donc-navy hover:bg-donc-navy/90` |
| Info | `bg-sky-100` | `text-donc-sky` | `bg-donc-navy hover:bg-donc-navy/90` |

---

## 24. Toast / Notification Pattern

Used in: All pages for feedback after mutations. Library: `react-hot-toast`.

### Setup (in `src/App.jsx`)
```jsx
import { Toaster } from 'react-hot-toast'

<Toaster position="top-right" toastOptions={{ duration: 3000 }} />
```

### Usage
```jsx
import toast from 'react-hot-toast'

toast.success('Atividade criada com sucesso!')
toast.error('Erro ao salvar: ' + error.message)
toast.error('Ação não permitida', { icon: '⚠️' })
```

### Convention
- `toast.success()` — green check icon, positive feedback (create, update, delete success)
- `toast.error()` — red X icon, error feedback (API errors, validation failures)
- `toast.error(msg, { icon: '⚠️' })` — warning-style for permission issues or non-critical failures
- Duration is 3s for all toasts (global config, not overridden per call)
- Position is top-right

### Files that fire toasts (36+ files)
ActivityModal, ActivityDetailModal, ClientForm, UserEditModal, TemperaturaCSM, DonkiePanel, EmailComposerModal, Navbar, Settings*, hooks (useBrief, useCatalog, useClientReports), FreshdeskPendingPage, OnboardingDetailPage.

---

## Version History

| Date | Changes |
|------|---------|
| 2026-06-14 | Added Button (#18), Avatar (#19), Search Input (#20), Filter Bar (#21), Tab/Segmented Control (#22), Confirmation Dialog (#23), Toast/Notification (#24) |
| 2026-06-14 | Initial pattern library extracted from existing implementations |
