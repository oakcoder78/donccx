import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { Icons } from '@/lib/icons'

const FOOTER_BG = '#f4f4f4'

export default function EmailViewPage() {
  const { token } = useParams()
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Link inválido.'); setLoading(false); return }
    supabase
      .from('email_view_cache')
      .select('html_body')
      .eq('token', token)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('E-mail não encontrado ou link expirado.')
        } else {
          setHtml(data.html_body)
        }
        setLoading(false)
      })
  }, [token])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: FOOTER_BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icons.Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', background: FOOTER_BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
        <div style={{
          background: '#fff', borderRadius: 8, padding: '48px 32px',
          textAlign: 'center', maxWidth: 420, width: '100%',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <Icons.FileQuestion className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p style={{ color: '#666', fontSize: 14, textAlign: 'center', margin: 0 }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <iframe
        title="E-mail"
        srcDoc={html}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  )
}
