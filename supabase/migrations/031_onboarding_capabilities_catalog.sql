-- 031: replace capability_type_id with catalog_item_id in onboarding_capabilities

alter table onboarding_capabilities
  add column if not exists catalog_item_id bigint references catalog_items(id) on delete cascade;

alter table onboarding_capabilities
  alter column capability_type_id drop not null;

alter table onboarding_capabilities
  drop constraint if exists onboarding_capabilities_onboarding_id_capability_type_id_key;

alter table onboarding_capabilities
  drop constraint if exists onboarding_capabilities_onboarding_id_catalog_item_id_key;

alter table onboarding_capabilities
  add constraint onboarding_capabilities_onboarding_id_catalog_item_id_key
  unique (onboarding_id, catalog_item_id);
