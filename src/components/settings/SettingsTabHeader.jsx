export default function SettingsTabHeader({
  actions
}) {
  if (!actions) return null

  return (
    <div className="flex justify-end mb-4">
      <div className="flex gap-2">
        {actions}
      </div>
    </div>
  )
}