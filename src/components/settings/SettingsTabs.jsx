export default function SettingsTabs({
  tabs,
  value,
  onChange
}) {
  return (
    <div className="border-b border-border-tertiary mb-5">

      <div className="flex gap-1">

        {tabs.map(tab => {

          const isActive = value === tab.key

          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`
                px-4 py-2 text-sm font-medium
                border-b-2 transition-colors
                ${
                  isActive
                    ? 'border-donc-navy text-text-primary'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }
              `}
            >
              {tab.label}
            </button>
          )
        })}

      </div>

    </div>
  )
}