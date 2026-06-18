import { useAuth } from '../contexts/AuthContext'

const variants = {
  'no-access': {
    title: 'Poxa...',
    desc: "Esse módulo <strong>não faz parte</strong> do seu plano de acesso.",
    mouth: 'M48 78 Q60 84 72 78',
    color: '#59c2ed',
    arms: '<line x1="26" y1="70" x2="52" y2="62" stroke="#59c2ed" stroke-width="3" stroke-linecap="round"/><line x1="52" y1="62" x2="40" y2="82" stroke="#59c2ed" stroke-width="3" stroke-linecap="round"/><line x1="94" y1="70" x2="68" y2="62" stroke="#59c2ed" stroke-width="3" stroke-linecap="round"/><line x1="68" y1="62" x2="80" y2="82" stroke="#59c2ed" stroke-width="3" stroke-linecap="round"/>'
  },
  maintenance: {
    title: 'Opsss...',
    desc: 'Esse módulo <strong>saiu pra tomar um café</strong>. Volta já! ☕',
    mouth: 'M48 76 Q60 82 72 76',
    color: '#BA7517',
    hat: '<path d="M38 48 Q38 38 60 36 Q82 38 82 48" fill="none" stroke="#BA7517" stroke-width="3.5" stroke-linecap="round"/><rect x="34" y="46" width="52" height="5" rx="2.5" fill="#BA7517"/>'
  },
  error: {
    title: 'Eita...',
    desc: 'Algo deu errado. O módulo <strong>deu uma bugadinha</strong>.',
    mouth: 'M48 82 Q60 78 72 82',
    color: '#E24B4A',
    dizzy: '<path d="M76 26 Q82 22 76 16 Q70 10 76 6" stroke="#E24B4A" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M64 22 Q70 18 64 12 Q58 6 64 2" stroke="#E24B4A" stroke-width="2.5" stroke-linecap="round" fill="none"/>'
  }
}

export default function ModuleUnavailablePage({ variant = 'maintenance' }) {
  const { signOut } = useAuth()
  const v = variants[variant] || variants.maintenance

  const extra = v.arms || v.hat || v.dizzy || ''
  const dizzyClass = v.dizzy ? 'dizzy' : ''

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center gap-0.5 mb-10">
          <span className="text-donc-lime font-bold text-3xl">donc</span>
          <span className="text-donc-navy/40 font-bold text-3xl">CX</span>
        </div>

        <div className="mb-8 inline-block">
          <svg viewBox="0 0 120 120" fill="none" className="w-[130px] h-[130px] overflow-visible">
            <style>{`
              @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
              .float { animation: float 3s ease-in-out infinite; transform-origin: center; }
              @keyframes dizzy { 0% { transform: rotate(0deg); opacity: 1; } 50% { transform: rotate(180deg); opacity: 0.6; } 100% { transform: rotate(360deg); opacity: 1; } }
              .dizzy { animation: dizzy 2s ease-in-out infinite; transform-origin: 70px 26px; }
            `}</style>
            <g className="float">
              <ellipse cx="60" cy="112" rx="28" ry="4" fill="#e8e7e3" />
              <rect x="28" y="36" width="64" height="56" rx="14" fill={v.color} opacity="0.10" />
              <rect x="28" y="36" width="64" height="56" rx="14" stroke={v.color} strokeWidth="2.5" />
              <circle cx="48" cy="60" r="5" fill="#173557" />
              <circle cx="72" cy="60" r="5" fill="#173557" />
              <circle cx="49.5" cy="58.5" r="2" fill="white" />
              <circle cx="73.5" cy="58.5" r="2" fill="white" />
              <g className={dizzyClass} dangerouslySetInnerHTML={{ __html: extra }} />
              <path d={v.mouth} stroke="#173557" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </g>
          </svg>
        </div>

        <h2 className="text-xl font-bold text-donc-navy mb-3">{v.title}</h2>
        <div className="w-10 h-[2px] bg-border-tertiary mx-auto mb-5 rounded" />
        <p
          className="text-sm text-text-tertiary leading-relaxed max-w-xs mx-auto mb-9"
          dangerouslySetInnerHTML={{ __html: v.desc }}
        />

        <button
          onClick={signOut}
          className="inline-flex items-center gap-2 font-medium text-sm px-6 py-2.5 rounded-md border border-border-secondary bg-transparent text-text-secondary hover:border-donc-sky hover:text-donc-navy hover:bg-bg-secondary transition-colors"
        >
          ← Voltar ao login
        </button>

        <p className="text-xs text-text-tertiary/50 mt-8">
          doncCX Hub &bull; Módulo temporariamente indisponível
        </p>
      </div>
    </div>
  )
}
