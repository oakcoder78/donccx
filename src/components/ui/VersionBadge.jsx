const sha = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev'

export function VersionBadge() {
  return (
    <div className="fixed bottom-2 left-2 z-50 pointer-events-none select-none">
      <span
        style={{ fontSize: '10px', lineHeight: '1.4' }}
        className="text-text-tertiary/60 bg-bg-primary/70 backdrop-blur-sm px-1.5 py-0.5 rounded"
      >
        v · {sha}
      </span>
    </div>
  )
}
