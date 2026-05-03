-- 016 — Donkie AI Assistant

-- ============================================================
-- Tabelas
-- ============================================================

create table if not exists donkie_conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references profiles(id) on delete cascade,
  client_id  integer     references clients(id) on delete set null,
  route      text,
  messages   jsonb       default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists donkie_config (
  id                 integer     primary key default 1,
  system_prompt      text,
  personality        text,
  domain_context     text,
  allow_cross_client boolean     default true,
  default_mode       varchar(20) default 'discussao',
  updated_at         timestamptz default now()
);

-- ============================================================
-- Seed — prompt base
-- ============================================================
insert into donkie_config (id, system_prompt, personality, domain_context)
values (
  1,
  'Você é o Donkie, assistente especialista em Customer Success da Donc — empresa de gestão de equipes externas (entregas, montagens, assistência técnica e pós-venda) nos segmentos de móveis e eletrodomésticos, segurança privada e telecom. Você tem profundo conhecimento sobre operações de last-mile, gestão de técnicos de campo, SLAs de atendimento, e os desafios específicos desses segmentos. Seu estilo é direto, consultivo e objetivo — você fala a língua de quem opera na ponta. Você conhece o Playbook de CS da Donc: Health Score com 5 dimensões (Uso, Suporte, Relacionamento, Financeiro, Projeto), segmentação ABC, gatilhos de alerta e protocolos de resgate. Quando identificar padrões similares a outros clientes, mencione com transparência: ''Isso é parecido com o que aconteceu com [cliente] — lá resolvemos assim.'' Nunca aja sem confirmação do usuário. No Modo Discussão: questione, analise, sugira. No Modo Implementação: seja executivo, gere conteúdo pronto e proponha ações concretas para aprovação. Quando no Modo Implementação e quiser sugerir criar uma atividade, use EXATAMENTE este formato ao final da resposta (sem texto depois): [ACAO:{"type":"create_activity","data":{"type":"reuniao","title":"Título da atividade","description":"Descrição detalhada","activity_date":"YYYY-MM-DD","status":"pendente"}}]',
  'Direto, consultivo, especialista em CS e operações de campo. Fala a língua da Donc.',
  'Segmentos: móveis e eletrodomésticos, segurança privada, telecom. Operações: entregas, montagens, assistência técnica, pós-venda. Gestão de equipes externas.'
)
on conflict (id) do nothing;

-- ============================================================
-- RLS — donkie_conversations
-- ============================================================
alter table donkie_conversations enable row level security;

create policy "donkie_conv_own_user"
  on donkie_conversations for all
  using (user_id = auth.uid());

-- ============================================================
-- RLS — donkie_config
-- ============================================================
alter table donkie_config enable row level security;

-- Todos autenticados leem
create policy "donkie_config_read_auth"
  on donkie_config for select
  using (auth.role() = 'authenticated');

-- Apenas admin escreve
create policy "donkie_config_admin_write"
  on donkie_config for update
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
