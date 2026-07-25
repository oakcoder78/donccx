# Fix: Pre-fill override and delta in FieldEditForm

## Problem
FieldEditForm shows blank inputs for Valor, Cor da borda, delta override, delta text, delta type, delta color — even when auto-computed values exist and are displayed as "Auto: 1h54", "Auto: -5%", etc.

## Fix

### File: `src/pages/ReportEditorPage.jsx`

#### 1. Line 1061 — pre-fill `override` with auto-computed value
```js
// before:
override: state.override ?? '',
// after:
override: state.override ?? (autoValue != null ? String(autoValue) : ''),
```

#### 2. Line 1068 — pre-fill `deltaOverride` with auto-computed delta
```js
// before:
const [deltaOverride, setDeltaOverride] = useState(deltaState?.override ?? '')
// after:
const [deltaOverride, setDeltaOverride] = useState(deltaState?.override ?? (deltaAuto != null ? String(deltaAuto) : ''))
```

### Why it works
- Inputs display the auto value when no override is saved, giving the user a starting point.
- Save function already converts empty string `''` to `null` (lines 1074, 1082), so clearing the input and saving resets to auto.
- The `state.override ?? ''` pattern was only showing saved overrides; adding `(autoValue != null ? String(autoValue) : '')` gives a fallback.

### What does NOT change
- `accentColor`, `deltaText`, `deltaType`, `deltaColor` — these don't have auto-computed equivalents to fall back to. They show blank (which means "use slide default"), which is correct behavior.
