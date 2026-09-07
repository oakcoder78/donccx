# Changelog


# Changelog — 2026-07

## 2026-07-18

### Sync Scheduling — BRT timezone + Weekly + UI Polish

- **Fix:** `SettingsSyncStatus` — `toBRT()` normalizes old UTC cron (`1 0 …`) to BRT (`1 3 …`) at display time; DB doesn't need re-save (`UTC_TO_BRT` map + `toBRT(cronExpr)`).
- **New:** Weekly schedule — "Semanas" option in "Personalizado" custom dropdown; cron saves as `1 3 */{7n} * *`.
- **New:** `SettingsSyncStatus` — BRT explanation text below Salvar button: "As execuções ocorrem às 00:01 BRT...".
- **UI:** Both buttons (Executar/Salvar) now `#59c2ed` with `minWidth:96` for same color and width; `justifyContent: center`.
- **Chore:** Removed `OLD_PRESETS` array (UTC fallback no longer needed).

## 2026-07-01

### Sync Scheduling — Fixes

- **Fix:** `manage_cron_job` RPC — `cron.unschedule()` throws "could not find valid entry for job" when job doesn't exist. Wrapped in `BEGIN...EXCEPTION` to prevent 500 on first-use scheduling (`20260701000003_fix_cron_unschedule_error.sql`).
- **Fix:** `SettingsSyncStatus` — times displayed in UTC; changed to `America/Sao_Paulo` (`formatDateTimeBR`, `nextCronDate`).
- **Fix:** `SettingsSyncStatus` — `handleScheduleOneoff` didn't refetch after scheduling; added `refetchLatest()`/`refetchHistory()`.
- **Fix:** `DoncAPIPendentes` — Modal crash: `confirmAction.count` accessed without optional chaining when `confirmAction` is null (`TypeError: Cannot read properties of null`).
- **Ops:** Edge Functions `sync-schedule` and `monthly-sync` redeployed.
