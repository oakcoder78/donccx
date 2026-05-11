export function SettingsSectionHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  backAction,
}) {
  return (
    <div className="flex items-start justify-between mb-4">

      <div className="flex items-center gap-3">
        {backAction && (
          <div className="flex-shrink-0">{backAction}</div>
        )}
        <div>
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            {Icon && (
              <Icon className="w-4 h-4 text-donc-navy" />
            )}
            {title}
          </h2>

          {subtitle && (
            <p className="text-xs text-text-tertiary mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}

    </div>
  )
}