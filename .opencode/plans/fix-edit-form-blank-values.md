# Fix: Edit form still shows blank value field

## Problem
User confirmed:
- Hard refresh done, no console errors
- "Auto: 1h54" displays correctly in the form
- But the `<input placeholder="Valor">` is still empty
- The `<select>` for delta type defaults correctly to "Seta: Auto"

The `useState` fallback `(autoValue != null ? String(autoValue) : '')` should show `"1.9"` in the input since `autoValue = 1.9` (the raw hours value that formats to "1h54").

## Hypothesis
The `autoValue` prop received by `FieldEditForm` is **not the same variable** as the one used to compute `displayValue` in the parent. At `useState` initialization time, React's closure captures the prop value correctly — but if the component **remounts** (e.g., due to StrictMode double-fire in dev, or a key change), the second mount might see a stale value.

**More likely:** the `state.override` field is already present in `fields[f.key]` as a string value (possibly `""` from a previous save), so `??` doesn't kick in. The `??` operator only replaces `null`/`undefined`, not `""`.

## Investigation
1. Add a `console.log({ fKey: f.key, stateOverride: state.override, autoValue, autoType: typeof autoValue })` at the top of `FieldEditForm` to verify the actual values.
2. Also log `deltaState?.override, deltaAuto` next to `deltaOverride`.

## Fix (based on findings)

### Scenario A: `state.override` is `""` (empty string)
The `??` operator does NOT replace `""` — only `null`/`undefined`.

**Change:**
```js
// before (line 1061):
override: state.override ?? (autoValue != null ? String(autoValue) : ''),
// after:
override: (state.override ?? '') !== '' ? state.override : (autoValue != null ? String(autoValue) : ''),
```

This handles: `null`, `undefined`, `""` — all three should fall back to auto value.

**Same for deltaOverride (line 1068):**
```js
// before:
const [deltaOverride, setDeltaOverride] = useState(deltaState?.override ?? (deltaAuto != null ? String(deltaAuto) : ''))
// after:
const deltaInit = (deltaState?.override ?? '') !== '' ? deltaState.override : (deltaAuto != null ? String(deltaAuto) : '')
const [deltaOverride, setDeltaOverride] = useState(deltaInit)
```

### Scenario B: Auto value is `0`
`0 != null` is `true`, and `String(0) = "0"` — this would show correctly in the input. No issue.

### Scenario C: `autoValue` is actually `null` despite display showing "Auto: 1h54"
This would mean `displayValue` is computed differently from `autoValue`. Not possible with current code — both use the same `autoValue` variable.

## Verification
1. Add console.log, npm run build, push
2. Open editor, click edit on any indicador, check console
3. Report back the logged values
4. Apply fix based on findings
