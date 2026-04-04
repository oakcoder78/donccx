export function VersionBadge() {
  return (
    <div className="fixed bottom-2 left-2 z-50 bg-black/20 backdrop-blur-sm text-white/50 text-[10px] px-2 py-0.5 rounded pointer-events-none select-none">
      v · {__COMMIT_HASH__}
    </div>
  )
}
