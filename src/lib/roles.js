// Central role registry — single source of truth for profiles.role
// Keys in English (DB/RLS/code), labels PT for UI when needed

export const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'csm',     label: 'CSM' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'sales',   label: 'Comercial' },
  { value: 'finance', label: 'Financeiro' },
]

export const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r.label]))

export const ROLE_VALUES = ROLE_OPTIONS.map(r => r.value)
