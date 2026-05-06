/* global React, Button, Icon, Badge, Card, Avatar */

function RoutePlanner() {
  const routes = [
    { id: "SP-01", team: "Equipe Tato", stops: 12, distance: "48 km", eta: "07:00 – 13:20", status: "Concluída", color: "var(--success-500)", filled: 12 },
    { id: "SP-02", team: "Equipe Nilo", stops: 9,  distance: "37 km", eta: "08:30 – 14:10", status: "Em rota",    color: "var(--sky-500)",     filled: 5  },
    { id: "SP-03", team: "Equipe Tato", stops: 7,  distance: "29 km", eta: "10:00 – 17:30", status: "Em rota",    color: "var(--sky-500)",     filled: 2  },
    { id: "SP-04", team: "Equipe Duo",  stops: 11, distance: "52 km", eta: "14:00 – 19:40", status: "Agendada",   color: "var(--ink-400)",     filled: 0  },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padding={0}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--divider)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--navy-900)", letterSpacing: "-0.01em" }}>Rotas · quarta, 22 abr</div>
            <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>4 rotas · 39 paradas · 166 km totais</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" size="sm" icon="download">Exportar</Button>
            <Button variant="accent" size="sm" icon="zap">Otimizar</Button>
          </div>
        </div>

        {routes.map(r => (
          <div key={r.id} style={{
            display: "grid", gridTemplateColumns: "90px 1fr 180px 160px 40px",
            gap: 18, alignItems: "center",
            padding: "18px 20px",
            borderBottom: "1px solid var(--divider)",
          }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--navy-900)", letterSpacing: "-0.02em" }}>{r.id}</div>
              <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>{r.eta}</div>
            </div>
            <div>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {Array.from({ length: r.stops }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 8, borderRadius: 2,
                    background: i < r.filled ? r.color : "var(--ink-150)",
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
                {r.team} · {r.stops} paradas · {r.distance}
              </div>
            </div>
            <Badge variant={r.status === "Concluída" ? "success" : r.status === "Em rota" ? "info" : "neutral"} dot>{r.status}</Badge>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar initials="RM" size={24} tone="sky" />
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>{r.team.replace("Equipe ", "")}</span>
            </div>
            <Icon name="chevron-right" size={18} color="var(--fg-4)" />
          </div>
        ))}
      </Card>
    </div>
  );
}

Object.assign(window, { RoutePlanner });
