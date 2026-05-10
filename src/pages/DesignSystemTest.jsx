import { Button } from '../components/ui/Button'

const COLORS = [
  { key: 'donc-navy',    label: 'Navy',    hex: '#173557' },
  { key: 'donc-sky',     label: 'Sky',     hex: '#59c2ed' },
  { key: 'donc-lime',    label: 'Lime',    hex: '#d3da47' },
  { key: 'donc-verde',   label: 'Verde',   hex: '#1D9E75' },
  { key: 'donc-amber',   label: 'Amber',   hex: '#BA7517' },
  { key: 'donc-red',     label: 'Red',     hex: '#E24B4A' },
  { key: 'donc-purple',  label: 'Purple',  hex: '#534AB7' },
  { key: 'donc-blue',    label: 'Blue',    hex: '#185FA5' },
  { key: 'donc-hubspot', label: 'Hubspot', hex: '#0091AE' },
]

const SIZES = ['xs', 'sm', 'md', 'lg']

const VARIANTS = ['primary', 'secondary', 'green', 'danger', 'ghost']

export default function DesignSystemTest() {
  return (
    <div className="max-w-4xl mx-auto p-8 space-y-10">

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-donc-navy">Design System — DoncCX</h1>
        <p className="text-sm text-text-tertiary mt-1">Validação visual de botões e paleta de cores.</p>
      </div>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary mb-4">Variantes × Tamanhos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-border-tertiary rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-donc-navy text-white">
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Variante</th>
                {SIZES.map(s => (
                  <th key={s} className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-tertiary">
              {VARIANTS.map(v => (
                <tr key={v} className="hover:bg-bg-tertiary transition-colors">
                  <td className="px-4 py-3 font-medium text-text-primary capitalize">{v}</td>
                  {SIZES.map(s => (
                    <td key={s} className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <Button variant={v} size={s}>
                          {s === 'xs' ? 'Ação' : s === 'sm' ? 'Ação' : s === 'md' ? 'Ação' : 'Ação'}
                        </Button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary mb-4">Paleta — Donc Colors</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {COLORS.map(c => (
            <div key={c.key} className="space-y-2">
              <div
                className="h-16 rounded-lg shadow-sm border border-border-tertiary"
                style={{ backgroundColor: c.hex }}
              />
              <div className="text-xs font-medium text-text-primary">{c.label}</div>
              <div className="text-xs text-text-tertiary font-mono">{c.hex}</div>
              <div className="text-xs text-text-tertiary">{c.key}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary mb-4">Estados</h2>
        <div className="flex flex-wrap gap-4">
          <Button variant="primary" size="md">Normal</Button>
          <Button variant="primary" size="md" disabled>Disabled</Button>
          <Button variant="green" size="md">Green</Button>
          <Button variant="green" size="md" disabled>Disabled</Button>
          <Button variant="danger" size="md">Danger</Button>
          <Button variant="danger" size="md" disabled>Disabled</Button>
        </div>
      </section>

    </div>
  )
}
