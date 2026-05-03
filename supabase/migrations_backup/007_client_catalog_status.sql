-- Adiciona coluna status em client_catalog para rastrear o estado de adoção de cada módulo.
-- Valores aceitos: 'implantado', 'em_implantacao', 'pausado', 'abandonado', 'descontinuado'
ALTER TABLE client_catalog ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'implantado';
