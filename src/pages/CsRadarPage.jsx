import { Icons } from '@/lib/icons'
import { PageHeader } from '@/components/ui/PageHeader'

export default function CsRadarPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="CS Radar" description="Atividades, RMCs e avanço de projetos do time de CS" />

      <div className="mt-12 flex flex-col items-center justify-center text-text-tertiary">
        <Icons.BarChart3 className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Em construção</p>
        <p className="text-sm mt-1">Os dados serão exibidos aqui em breve.</p>
      </div>
    </div>
  )
}
