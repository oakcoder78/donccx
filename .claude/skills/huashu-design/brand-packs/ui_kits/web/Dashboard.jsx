/* global React, Button, Icon, Badge, Card, Avatar, Stat */
const { useState: _useState } = React;

function Sparkline({ points, color = "var(--sky-500)" }) {
  return (
    <svg viewBox="0 0 280 30" preserveAspectRatio="none" style={{ width: "100%", height: 30, marginTop: 10 }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

function OSRow({ os }) {
  const toneMap = {
    "Em rota":     { v: "info" },
    "Concluída":   { v: "success" },
    "SLA em risco":{ v: "warn" },
    "Atrasada":    { v: "danger" },
    "Agendada":    { v: "neutral" },
  };
  const t = toneMap[os.status] || { v: "neutral" };
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "44px 1fr 140px 140px 40px",
      gap: 14, alignItems: "center",
      padding: "14px 18px",
      borderBottom: "1px solid var(--divider)",
    }}>
      <Avatar initials={os.initials} size={40} tone={os.tone} />
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--navy-900)", letterSpacing: "-0.01em" }}>{os.title}</div>
        <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 3, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>OS #{os.id}</span>
          <span>·</span>
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="map-pin" size={12} />{os.city}</span>
          <span>·</span>
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="clock" size={12} />{os.window}</span>
        </div>
      </div>
      <div><Badge variant={t.v} dot>{os.status}</Badge></div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-3)" }}>{os.team}</div>
      <div style={{ color: "var(--fg-4)", display: "inline-flex", justifyContent: "flex-end" }}>
        <Icon name="chevron-right" size={18} />
      </div>
    </div>
  );
}

function MapPreview() {
  // A very stylized, static map-like card — not a real map.
  return (
    <Card padding={0} style={{ overflow: "hidden", position: "relative", minHeight: 280 }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `
          radial-gradient(circle at 20% 30%, #e0f4fc 0%, transparent 40%),
          radial-gradient(circle at 70% 60%, #d6e9d6 0%, transparent 45%),
          linear-gradient(180deg, #f1f7f1 0%, #e4f0e4 100%)
        `,
      }} />
      {/* Fake streets */}
      <svg viewBox="0 0 600 280" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <g stroke="#b9c7d6" strokeWidth="1" fill="none" opacity="0.8">
          <path d="M0,60 L600,90"/>
          <path d="M0,140 Q300,170 600,130"/>
          <path d="M0,220 L600,240"/>
          <path d="M120,0 L140,280"/>
          <path d="M300,0 Q310,140 330,280"/>
          <path d="M460,0 L470,280"/>
        </g>
        {/* Route */}
        <path d="M80,210 Q180,130 280,140 T500,70" stroke="var(--sky-500)" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Pins */}
        <g>
          <circle cx="80"  cy="210" r="7" fill="var(--navy-700)" />
          <circle cx="280" cy="140" r="5" fill="var(--white)" stroke="var(--navy-700)" strokeWidth="2" />
          <circle cx="380" cy="100" r="5" fill="var(--white)" stroke="var(--navy-700)" strokeWidth="2" />
          <circle cx="500" cy="70"  r="7" fill="var(--lime-500)" stroke="var(--navy-700)" strokeWidth="2" />
        </g>
      </svg>
      <div style={{
        position: "absolute", top: 16, left: 16,
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(10px)",
        borderRadius: "var(--r-md)", padding: "8px 12px",
        boxShadow: "var(--shadow-sm)",
      }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: "var(--navy-900)" }}>Rota SP-03 · ao vivo</div>
        <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 2 }}>7 paradas · 2 concluídas</div>
      </div>
      <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", gap: 8 }}>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: "var(--white)", boxShadow: "var(--shadow-sm)", color: "var(--navy-700)", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700 }}>+</button>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: "var(--white)", boxShadow: "var(--shadow-sm)", color: "var(--navy-700)", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700 }}>−</button>
      </div>
    </Card>
  );
}

function Dashboard() {
  const orders = [
    { id: "482931", initials: "MA", tone: "sky",  title: "Montagem · Armário 4 portas",  city: "Moema, SP",       window: "14:30 – 16:00", status: "SLA em risco", team: "Equipe Tato · 2 téc." },
    { id: "482887", initials: "RV", tone: "lime", title: "Entrega · Sofá retrátil 2,20m", city: "Tatuapé, SP",     window: "10:00 – 11:30", status: "Em rota",       team: "Equipe Tato · 2 téc." },
    { id: "482812", initials: "LS", tone: "mint", title: "Assistência · Geladeira French",city: "Pinheiros, SP",   window: "09:00 – 10:00", status: "Concluída",     team: "Equipe Nilo · 1 téc." },
    { id: "482790", initials: "BC", tone: "navy", title: "Instalação · Cooktop 5 bocas",  city: "Vila Madalena, SP",window: "16:00 – 17:30", status: "Agendada",      team: "Equipe Duo · 1 téc." },
    { id: "482604", initials: "FP", tone: "sky",  title: "Retirada · Guarda-roupa 3p",    city: "Santana, SP",     window: "Ontem · 18:20", status: "Atrasada",      team: "Equipe Nilo · 1 téc." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Stat eyebrow="Entregas · hoje"  value="284"  delta="12% vs ontem" sub="Meta diária 310" />
        <Stat eyebrow="SLA cumprido"     value="96.4" unit="%" delta="2.1 pts" sub="Últimos 30 dias" dark />
        <Stat eyebrow="Técnicos em rota" value="48"   delta="3 vs ontem" sub="De 54 escalados" />
        <Stat eyebrow="Reentregas"       value="−38" unit="%" delta="desde jan/26" sub="Meta −40%" />
      </div>

      {/* Map + side stack */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        <MapPreview />
        <Card>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sky-700)", marginBottom: 10 }}>Próximos alertas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { icon: "alert-triangle", tone: "#8a6310", bg: "var(--warning-100)", title: "SLA em risco · OS #482931", sub: "Faltam 42 min para a janela de entrega." },
              { icon: "phone",          tone: "var(--sky-700)", bg: "var(--sky-100)",     title: "Cliente solicitou reagendamento", sub: "Móveis Aurora · Tatuapé, SP" },
              { icon: "check-circle",   tone: "#1e7a4d", bg: "var(--success-100)", title: "Rota SP-01 concluída", sub: "12 entregas · 0 ocorrências" },
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: a.bg, color: a.tone, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 32px" }}>
                  <Icon name={a.icon} size={16} />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--navy-900)", letterSpacing: "-0.005em" }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>{a.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* OS list */}
      <Card padding={0}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: "1px solid var(--divider)",
        }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--navy-900)", letterSpacing: "-0.01em" }}>Ordens de serviço · hoje</div>
            <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>Quarta · 22 abr · 128 abertas · 284 concluídas</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" size="sm" icon="filter">Filtros</Button>
            <Button variant="primary" size="sm" icon="plus">Nova OS</Button>
          </div>
        </div>
        <div>
          {orders.map(o => <OSRow key={o.id} os={o} />)}
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { Dashboard, Sparkline, OSRow, MapPreview });
