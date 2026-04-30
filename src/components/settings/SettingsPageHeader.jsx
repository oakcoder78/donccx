import { Button } from '../ui/Button'

export function SettingsPageHeader({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  actionVariant = 'primary',
  actionSize = 'sm',
  children,
}) {
  return (
    <div className="flex items-start justify-between gap-4">

      {/* Lado esquerdo */}
      <div className="space-y-1">

        <div className="flex items-center gap-2">

          {Icon && (
            <Icon className="w-4 h-4 text-text-tertiary" />
          )}

          <h2 className="text-base font-semibold text-text-primary">
            {title}
          </h2>

        </div>

        {description && (
          <p className="text-sm text-text-tertiary">
            {description}
          </p>
        )}

      </div>

      {/* Lado direito */}
      <div className="flex items-center gap-2">

        {/* Botões adicionais opcionais */}
        {children}

        {/* Botão principal */}
        {actionLabel && (
          <Button
            size={actionSize}
            variant={actionVariant}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}

      </div>

    </div>
  )
}