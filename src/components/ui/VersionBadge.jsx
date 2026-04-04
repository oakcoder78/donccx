export function VersionBadge() {
  return (
    <div style={{
      position: 'fixed',
      bottom: '8px',
      right: '8px',
      zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      color: 'white',
      fontSize: '11px',
      padding: '2px 6px',
      borderRadius: '4px',
      pointerEvents: 'none',
    }}>
      v · {__COMMIT_HASH__}
    </div>
  )
}
