import { useDonkie } from '../../hooks/useDonkie'

export function DonkieButton() {
  const { isOpen, toggle, messages } = useDonkie()

  const unread = 0 // reservado para notificações futuras

  return (
    <button
      onClick={toggle}
      title={isOpen ? 'Fechar Donkie' : 'Abrir Donkie'}
      style={{
        position:     'fixed',
        bottom:       24,
        right:        24,
        zIndex:       200,
        width:        52,
        height:       52,
        borderRadius: '50%',
        background:   '#173557',
        border:       'none',
        cursor:       'pointer',
        boxShadow:    '0 4px 20px rgba(23,53,87,0.35)',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        transition:   'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform  = 'scale(1.08)'
        e.currentTarget.style.boxShadow  = '0 6px 28px rgba(23,53,87,0.45)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform  = 'scale(1)'
        e.currentTarget.style.boxShadow  = '0 4px 20px rgba(23,53,87,0.35)'
      }}
    >
      {isOpen ? (
        /* X quando aberto */
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#d3da47" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        /* Logo D quando fechado */
        <span style={{
          fontWeight: 800,
          fontSize:   22,
          color:      '#d3da47',
          lineHeight: 1,
          fontFamily: "'Montserrat', sans-serif",
          letterSpacing: -1,
        }}>D</span>
      )}

      {/* Badge de mensagens não lidas */}
      {!isOpen && unread > 0 && (
        <span style={{
          position:     'absolute',
          top:          2,
          right:        2,
          width:        18,
          height:       18,
          borderRadius: '50%',
          background:   '#ef4444',
          color:        '#fff',
          fontSize:     10,
          fontWeight:   700,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          border:       '2px solid #fff',
        }}>
          {unread}
        </span>
      )}
    </button>
  )
}
