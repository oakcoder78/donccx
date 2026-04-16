# Conceitos Centrais do doncCX Hub

Este documento define os conceitos fundamentais que sustentam o funcionamento do sistema **doncCX Hub**. Eles formam o modelo mental pelo qual a plataforma interpreta dados operacionais e os transforma em inteligência acionável para Customer Success Managers.


## 1. Dado (Data)

**Definição**
Um dado é o registro mais básico de uma ocorrência no sistema. Representa um fato isolado, sem interpretação ou contexto.

**Exemplos**
- Criação de uma atividade
- Atualização do status de um projeto
- Alteração de um campo financeiro (ex.: valor da fatura)
- Registro de um login do cliente na plataforma
- Cadastro de um novo contato

**Propósito**
Fornecer a matéria-prima bruta para o sistema. Por si só, um dado não gera insight; ele precisa ser processado para se tornar significativo.

**Como é utilizado**
Os dados são coletados continuamente a partir das operações diárias e armazenados para alimentar a geração de eventos.

**Relação com outros conceitos**
Dados → (processamento) → Eventos


## 2. Evento (Event)

**Definição**
Um evento é uma mudança observável derivada de um ou mais dados. Representa algo que aconteceu e que pode ser interpretado como comportamento ou alteração de estado.

**Exemplos**
- Marcio concluiu uma milestone
- Uma atividade foi registrada como "pendente"
- Um ticket de suporte foi aberto
- O pagamento de uma fatura chegou com atraso
- O uso do produto caiu 20% em relação à semana anterior

**Propósito**
Transformar registros estáticos em pontos de mudança que podem ser analisados. Eventos são o primeiro passo rumo à interpretação.

**Como é utilizado**
Eventos são identificados por regras de negócio e alimentam a geração de sinais, que representam tendências ou padrões de comportamento.

**Relação com outros conceitos**
Dados → Eventos → Sinais


## 3. Sinal (Signal)

**Definição**
Um sinal é uma interpretação significativa de um ou mais eventos. Indica uma mudança relevante no comportamento, contexto ou saúde do cliente que merece atenção.

**Exemplos**
- Redução contínua no uso do produto ao longo de três semanas
- Aumento no número de tickets de suporte abertos pelo mesmo cliente
- Atrasos recorrentes na entrega de marcos de projeto
- Ausência de interação (atividades, e-mails, ligações) por mais de 30 dias
- Crescimento positivo e consistente no volume de uso

**Propósito**
Servir como base da inteligência do sistema. Sinais são os gatilhos que permitem detectar riscos, oportunidades ou evoluções antes que se tornem evidentes apenas por eventos isolados.

**Como é utilizado**
Sinais são gerados pela aplicação de regras sobre eventos e alimentam os cálculos de Health Score, geração de alertas e recomendações de ação.

**Relação com outros conceitos**
Eventos → (regras) → Sinais → (análise) → Health Score, Alertas, Prioridades


## 4. Regra (Rule)

**Definição**
Uma regra é um critério pré-definido que interpreta eventos ou sinais para determinar se algo representa uma mudança relevante, uma penalidade, um bônus ou a necessidade de um alerta.

**Exemplos**
- Se o uso do produto cair mais de 15% em relação à média dos últimos 30 dias → aplicar penalidade na dimensão "Uso"
- Se houver mais de 3 tickets de suporte abertos em uma semana → gerar sinal de "Aumento de demanda de suporte"
- Se uma milestone estiver atrasada há mais de 5 dias úteis → aplicar ajuste na dimensão "Projeto"

**Propósito**
Padronizar a interpretação dos dados, reduzindo subjetividade e garantindo que o comportamento do sistema seja previsível e alinhado com as estratégias de Customer Success da organização.

**Como é utilizado**
Regras são configuradas pelos administradores da plataforma e são aplicadas continuamente aos eventos à medida que eles ocorrem.

**Relação com outros conceitos**
Eventos → (regras) → Sinais
Sinais → (regras) → Ajustes nas dimensões / Health Score


## 5. Dimensão (Dimension)

**Definição**
Uma dimensão é um eixo específico de avaliação que representa um aspecto crítico do relacionamento com o cliente. Cada dimensão contribui para o Health Score total.

**Dimensões principais**
- **Uso**: Mede a adoção, frequência e profundidade de utilização do produto/serviço pelo cliente.
- **Suporte**: Avalia a qualidade, efetividade e satisfação nas interações de suporte.
- **Relacionamento**: Reflete a força do vínculo, engajamento e proximidade com os stakeholders-chave do cliente.
- **Financeiro**: Considera adimplência, previsibilidade de receita, crescimento e health financeiro do contrato.
- **Projeto**: Avalia o andamento, entrega e qualidade de iniciativas conjuntas (implementações, migrações, etc.).

**Propósito**
Permitir uma análise multifacetada da saúde do cliente, identificando em quais áreas o relacionamento está forte ou frágil.

**Como é utilizado**
Cada dimensão possui seu próprio conjunto de regras e sinais. O valor de cada dimensão é calculado continuamente e combinado para formar o Health Score total.

**Relação com outros conceitos**
Sinais → (regras por dimensão) → Valores das Dimensões → (agregação) → Health Score


## 6. Health Score (Pontuação de Saúde)

**Definição**
O Health Score é uma representação numérica da saúde geral do relacionamento com um cliente. Ele varia de 0 a 100, onde 100 representa o estado ideal (sem riscos detectados) e valores menores indicam crescentes níveis de preocupação.

**Propósito**
Fornecer uma métrica unificada que resume o estado multidimensional do cliente, permitindo comparação, priorização e monitoramento ao longo do tempo.

**Como é utilizado**
- É exibido na visão do cliente e em dashboards gerenciais
- Serve como base para geração de alertas automáticos
- Alimenta os cálculos de tendência e previsão de comportamento futuro

**Relação com outros conceitos**
Sinais → (regras por dimensão) → Valores das Dimensões → (agregação) → Health Score
Health Score → (registro temporal) → Histórico de Score


## 7. Histórico de Score (Score History)

**Definição**
O Histórico de Score é o registro temporal das variações do Health Score ao longo do tempo para cada cliente. Ele permite analisar tendências, identificar padrões de melhoria ou deterioração e correlacionar mudanças de score com eventos específicos.

**Propósito**
Fornecer uma visão dinâmica da saúde do cliente, possibilitando avaliar a eficácia de intervenções, prever riscos futuros e tomar decisões baseadas em dados históricos.

**Como é utilizado**
- Exibido em gráficos de linha na visão do cliente e em relatórios de tendência
- Utilizado para calcular velocidades de mudança (melhoria ou queda rápida)
- Base para algoritmos de previsão de churn e oportunidades de expansão
- Correlacionado com marcos do projeto, campanhas de engajamento e mudanças na equipe de contato

**Relação com outros conceitos**
Health Score → (registro temporal) → Histórico de Score
Histórico de Score → (análise de tendência) → Alertas, Previsões e Recomendações


## 8. Risco (Risk)

**Definição**
Risco é a probabilidade de ocorrência de eventos negativos que impactam adversamente o relacionamento com o cliente, como churn, redução de contrato ou insatisfação significativa. É derivado da análise de sinais negativos, tendências de declínio no Health Score e fatores contextuais.

**Propósito**
Quantificar a probabilidade de perda ou deterioração do valor do cliente, permitindo priorizar esforços de retenção e intervenções proativas.

**Como é utilizado**
- Calculado com base em sinais de risco (uso em declínio, aumento de tickets, atrasos recorrentes)
- Exibido em níveis (Baixo, Médio, Alto, Crítico) nos dashboards de CSM
- Utilizado para acionar playbooks de mitigação de risco
- Alimenta a segmentação de clientes por prioridade de atendimento

**Relação com outros conceitos**
Sinais negativos → (análise de padrões) → Risco
Risco + Health Score → (matriz de priorização) → Filas de Trabalho de CS


## 9. Prioridade (Priority)

**Definição**
Prioridade é o nível de urgência e importância atribuído a um cliente com base em seu Health Score, valor potencial (ARR/MRR), risco de churn e oportunidades de expansão. Determina a ordem em que os CSMs devem atender e alocar recursos.

**Propósito**
Otimizar a alocação limitada do tempo da equipe de Customer Success, focando primeiro nos clientes que necessitam de atenção imediata ou apresentam maior oportunidade de crescimento líquido.

**Como é utilizado**
- Calculado por fórmula que combina Health Score inverso (risco), valor do contrato e potencial de upsell
- Segmentado em faixas (P1 - Crítico, P2 - Alto, P3 - Médio, P4 - Baixo)
- Utilizado para criar filas de trabalho automatizadas no CRM
- Revisado semanalmente em reuniões de alinhamento de equipe

**Relação com outros conceitos**
Health Score + Valor do Cliente + Potencial de Expansão → (algoritmo de priorização) → Prioridade
Prioridade → (definição de foco) → Atividades do CSM


## 10. Alerta (Alert)

**Definição**
Alerta é uma notificação proativa gerada quando condições específicas de risco ou oportunidade são atendidas, como cruzamento de limites de Health Score, detecção de sinais críticos ou tendências preocupantes.

**Propósito**
Garantir que os CSMs sejam notificados prontamente sobre situações que requerem atenção, permitindo intervenções em tempo hábil antes que problemas se agravem ou oportunidades se percam.

**Como é utilizado**
- Configurável por limites de score (ex.: alerta quando score < 60 por mais de 7 dias)
- Baseado em tendências (ex.: alerta quando score cai 20% em 30 dias)
- Vinculado a sinais específicos (ex.: 3+ tickets de suporte em alta gravidade em uma semana)
- Enviado por email, Slack, Teams ou exibido no painel de notificações do CSM
- Pode incluir contexto sugerido e ações recomendadas

**Relação com outros conceitos**
Health Score/Dimensões → (monitoramento de limites) → Alertas
Sinais → (detecção de padrões) → Alertas de risco/oportunidade


## 11. Recomendação (Recommendation)

**Definição**
Recomendação é uma sugestão contextualizada de ação que um CSM pode tomar para melhorar o Health Score, mitigar riscos ou explorar oportunidades, baseada na análise de sinais, dimensões em declínio e padrões identificados no Histórico de Score.

**Propósito**
Transformar insights em ações concretas e eficazes, reduzindo o tempo entre identificação de um problema e implementação de uma solução adequada ao contexto do cliente.

**Como é utilizado**
- Gerada por regras de negócio associadas a combinações de sinais e valores de dimensão
- Personalizada por segmento de cliente, estágio do contrato e produto/serviço
- Vinculada a playbooks de sucesso do cliente e melhores práticas
- Rastreada para medição de eficácia (taxa de adoção, impacto no score)
- Exibida no perfil do cliente junto com justificativa baseada em dados

**Relação com outros conceitos**
Sinais/Dimensões → (regras de recomendação) → Ações Sugeridas
Histórico de Score → (análise de eficácia passado) → Refinamento de recomendações


## 12. Ciclo de Vida da Saúde do Cliente (Client Health Lifecycle)

**Definição**
O Ciclo de Vida da Saúde do Cliente descreve as fases típicas através das quais o Health Score de um cliente evolui ao longo do tempo, desde a onboarding até a renovação ou churn, incluindo períodos de estabilidade, crescimento, risco e recuperação.

**Propósito**
Fornecer um modelo estruturado para entender as dinâmicas de saúde do cliente, antecipar necessidades em cada fase e aplicar intervenções proativas adequadas ao estágio do ciclo.

**Fases típicas**
1. Onboarding: Início do relacionamento, foco em adoção inicial e configuração bem-sucedida
2. Estabilização: Período de consolidação onde o uso se torna regular e o relacionamento se fortalece
3. Crescimento: Oportunidades de expansão de uso, upsell ou cross-sell identificadas
4. Risco Emergente: Sinais iniciais de declínio que requerem atenção preventiva
5. Intervenção: Ações corretivas aplicadas para reverter tendências negativas
6. Recuperação ou Churn: Resultado da intervenção, levando à melhora da saúde ou término do relacionamento

**Como é utilizado**
- Mapeado ao histórico de score para identificar em que fase cada cliente se encontra
- Utilizado para selecionar playbooks e recomendações adequadas à fase
- Base para previsão de renovação e planejamento de engajamento
- Alimenta o diálogo estratégico em revisões de negócio (QBRs)

**Relação com outros conceitos**
Health Score Histórico → (análise de padrões) → Identificação da Fase do Ciclo
Fase do Ciclo → (seleção de intervenção) → Playbooks e Recomendações


## 13. Relações entre Conceitos

**Visão Integrada do Modelo**
O doncCX Hub opera como um sistema interconectado onde cada conceito alimenta o próximo, formando um ciclo contínuo de coleta, interpretação, ação e aprendizado:

1. Dados Brutos → são coletados de fontes integradas (CRM, produto, suporte, financeiro)
2. Eventos → são gerados a partir de mudanças significativas nos dados
3. Sinais → são derivados da aplicação de regras sobre eventos, indicando tendências de comportamento
4. Dimensões → são atualizadas pelos sinais, refletindo aspectos específicos da saúde (Uso, Suporte, Relacionamento, Financeiro, Projeto)
5. Health Score → é calculado pela agregação das dimensões, fornecendo uma visão unificada de 0 a 100
6. Histórico de Score → registra a evolução temporal do Health Score, permitindo análise de tendência
7. Risco → é inferido a partir de sinais negativos, tendências de declínio e valor do cliente
8. Prioridade → combina Health Score inverso, risco, valor e potencial para focalizar esforços
9. Alertas → são disparados quando limites ou tendências específicas são atendidos
10. Recomendações → são geradas com base em sinais, dimensões e histórico para orientar ações
11. Ciclo de Vida → fornece o contexto estrutural para interpretar onde o cliente está em sua jornada

**Ciclo de Aprendizado**
- As ações tomadas (baseadas em recomendações) geram novos dados
- Estes dados são reprocessados em eventos, atualizando sinais e dimensões
- O sistema aprende com os resultados, refinando regras e recomendações ao longo do tempo

**Benefício Final**
Este modelo integrado transforma dados operacionais em inteligência acionável que permite:
- Intervenções precoces para reduzir churn
- Identificação precisa de oportunidades de expansão
- Alocação otimizada do tempo dos CSMs baseado em impacto potencial
- Melhoria previsível na retenção e satisfação do cliente
- Escalabilidade da função de Customer Success através da automação inteligente
- Cultura de decisões baseadas em dados em toda a organização de sucesso do cliente