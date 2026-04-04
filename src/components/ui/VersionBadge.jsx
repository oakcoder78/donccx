export function VersionBadge() {
  return (
    <div style={{
      position: 'fixed',
      bottom: '6px',
      right: '8px',
      zIndex: 9999,
      background: 'transparent',
      color: '#9ca3af',
      fontSize: '10px',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      v · {__COMMIT_HASH__}
    </div>
  )
}
