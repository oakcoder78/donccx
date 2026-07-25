# Step-by-step plan

## 1. `src/lib/reportFields.js` — add `parseFieldValue`

```js
export function parseFieldValue(field, formatted) {
  if (formatted == null || formatted === '') return null
  switch (field.type) {
    case 'duration': {
      const m = formatted.match(/^(\d+(?:[.,]\d+)?)\s*h(?:(\d+))?$/i)
      if (m) return Number(m[1].replace(',', '.')) + (m[2] ? Number(m[2]) / 60 : 0)
      const n = formatted.match(/^(\d+)\s*min/i)
      if (n) return Number(n[1]) / 60
      const raw = Number(formatted.replace(',', '.'))
      return isNaN(raw) ? null : raw
    }
    case 'percent':
    case 'delta':
      return Number(formatted.replace(/[+%\s]/g, '').replace(',', '.')) || null
    case 'number':
      return Number(formatted.replace(/\./g, '').replace(',', '.')) || null
    default:
      return formatted
  }
}
```

## 2. `FieldEditForm` — initial state changes

### Value input:
```js
// before:
override: (state.override ?? '') !== '' ? state.override : (autoValue != null ? String(autoValue) : ''),
// after:
override: (state.override ?? '') !== ''
  ? formatFieldValue(f, state.override)       // saved override → formatted for editing
  : (displayValue != null ? displayValue : ''), // auto value (already formatted)
```

### Delta override:
```js
// before:
const autoDelta = deltaAuto != null ? String(deltaAuto) : ''
const [deltaOverride, setDeltaOverride] = useState(...)
// after:
const autoDeltaDisplay = deltaDisplay ?? ''
const deltaInit = (deltaState?.override ?? '') !== ''
  ? formatFieldValue(deltaField, deltaState.override)
  : autoDeltaDisplay
const [deltaOverride, setDeltaOverride] = useState(deltaInit)
```

### DeltaType + DeltaColor auto-detect & pre-fill:
```js
const autoDeltaType = deltaAuto != null
  ? (deltaAuto > 0 ? 'up' : deltaAuto < 0 ? 'down' : 'neutral')
  : ''
const autoDeltaColor = deltaAuto != null
  ? (deltaAuto > 0
    ? (f.invertDeltaColor ? 'red' : 'green')
    : deltaAuto < 0
      ? (f.invertDeltaColor ? 'green' : 'red')
      : 'gray')
  : ''
```
Then use `autoDeltaType` and `autoDeltaColor` as initial state defaults (same `!== ''` pattern).

## 3. `FieldEditForm` — save function

```js
function save() {
  const rawOverride = draft.override === ''
    ? null
    : (displayValue != null && draft.override === displayValue) ? null   // same as auto → no override
    : parseFieldValue(f, draft.override)                                  // custom → parse + save

  const rawDelta = deltaOverride === ''
    ? null
    : (deltaDisplay != null && deltaOverride === deltaDisplay) ? null     // same as auto
    : deltaField ? parseFieldValue(deltaField, deltaOverride) : null      // custom → parse + save
  
  onChange(f.key, {
    label: draft.label || null,
    sublabel: draft.sublabel || null,
    override: rawOverride,
    accentColor: draft.accentColor || null,
    deltaEnabled: draft.deltaEnabled,
    deltaText: draft.deltaText || null,
    deltaType: draft.deltaType || null,
    deltaColor: draft.deltaColor || null,
  })
  if (deltaField && rawDelta !== deltaState?.override) {
    onChange(deltaField.key, { override: rawDelta })
  }
  onClose()
}
```

## Why this works
- Input shows formatted values (`1h54`, `-5%`, `1,46`) for both auto and saved overrides
- Auto-detected deltaType/deltaColor are visually selected, not hidden behind "Auto"
- Saving "1h54" (same as auto) stores `null` → keeps using auto calculation
- Saving "2h30" (custom) stores `2.5` (raw) → generator uses it as raw number
- Parsing is safe: unparseable input returns `null` → falls back to auto value
- All existing select options still work (deltaType override, deltaColor override)

## Verification
1. `npm run build`
2. Open editor → edit indicador → value shows "1h54", deltaType shows "▲ Alta"/"▼ Baixa", deltaColor shows "Verde"/"Vermelho"
3. Change value → save → reopen → shows saved formatted value
4. Change back to auto → save → override cleared, shows auto again
