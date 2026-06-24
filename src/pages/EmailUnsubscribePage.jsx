import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { Icons } from '@/lib/icons'

export default function EmailUnsubscribePage() {
  const { token } = useParams()
  const [status, setStatus] = useState('loading') // loading | done | already | error

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    ;(async () => {
      const { data, error: fetchErr } = await supabase
        .from('email_unsubscribes')
        .select('id, contact_id, email, unsubscribed_at')
        .eq('token', token)
        .single()

      if (fetchErr || !data) {
        setStatus('error')
        return
      }

      if (data.unsubscribed_at) {
        setStatus('already')
        return
      }

      const { error: updateErr } = await supabase
        .from('contacts')
        .update({ unsubscribed: true })
        .eq('id', data.contact_id)

      if (updateErr) {
        setStatus('error')
        return
      }

      await supabase
        .from('email_unsubscribes')
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq('id', data.id)

      setStatus('done')
    })()
  }, [token])

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        {status === 'loading' && (
          <Icons.Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        )}

        {status === 'done' && (
          <>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icons.Check className="w-5 h-5 text-green-600" />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#173557', margin: '0 0 8px' }}>
              Inscri&ccedil;&atilde;o cancelada
            </h1>
            <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
              Voc&ecirc; n&atilde;o receber&aacute; mais nossas comunica&ccedil;&otilde;es em massa.
            </p>
          </>
        )}

        {status === 'already' && (
          <>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icons.HelpCircle className="w-5 h-5 text-amber-500" />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#173557', margin: '0 0 8px' }}>
              J&aacute; cancelado
            </h1>
            <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
              Voc&ecirc; j&aacute; est&aacute; descadastrado de nossas comunica&ccedil;&otilde;es em massa.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <Icons.AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p style={{ fontSize: 14, color: '#666', textAlign: 'center', margin: 0 }}>
              Link inv&aacute;lido ou expirado.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    background: '#f4f4f4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    margin: 0,
  },
  card: {
    background: '#fff',
    borderRadius: 8,
    padding: '48px 32px',
    textAlign: 'center',
    maxWidth: 420,
    width: '100%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
}
