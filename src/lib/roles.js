// Central role registry — single source of truth for profiles.role
// Keys and labels in English — follows platform pattern (Admin/Manager/CSM/Analyst)

export const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'csm',     label: 'CSM' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'sales',   label: 'Sales' },
  { value: 'finance', label: 'Finance' },
]

export const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r.label]))

export const ROLE_VALUES = ROLE_OPTIONS.map(r => r.value)
