export function SettingsPageContainer({
  children,
  variant = 'narrow'
}) {
  const widthClass =
    variant === 'wide'
      ? 'w-full max-w-6xl'
      : 'max-w-3xl'

  return (
    <div className={`${widthClass} space-y-6`}>
      {children}
    </div>
  )
}