-- Adiciona constraints UNIQUE em name para stages e catalog_items
-- (constraints já existem no banco; migration para sincronizar o código)

alter table stages
  add constraint stages_name_unique unique (name);

alter table catalog_items
  add constraint catalog_items_name_unique unique (name);
