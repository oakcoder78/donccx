/* global React, MIcon, MBadge, MHeader, MTabBar, MPrimaryBtn */

function TodayScreen({ onOpenStop }) {
  const stops = [
    { id: "482887", seq: 1, title: "Entrega · Sofá retrátil", addr: "R. Tuim, 820 · Moema", window: "10:00 – 11:30", status: "Concluída",  tone: "success" },
    { id: "482931", seq: 2, title: "Montagem · Armário 4p",    addr: "Al. dos Jurupis, 455 · Moema", window: "11:30 – 13:00", status: "Próxima",   tone: "info"    },
    { id: "482948", seq: 3, title: "Entrega + Instalação · Cooktop", addr: "R. Canário, 214 · Moema", window: "14:00 – 15:30", status: "Agendada",  tone: "neutral" },
    { id: "482971", seq: 4, title: "Assistência · Geladeira",        addr: "R. Diogo Jácome, 732 · Moema", window: "15:30 – 16:30", status: "Agendada", tone: "neutral" },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", background: "var(--bg-subtle)" }}>
      <MHeader title="Hoje" right={
        <button style={{ border:0, background:"transparent", color:"var(--fg-3)", display:"inline-flex", padding:4 }}>
          <MIcon name="bell" size={20} />
        </button>
      } />

      {/* Greeting / summary */}
      <div style={{ padding: "18px 20px 10px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sky-700)" }}>Quarta · 22 abr</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, letterSpacing: "-0.025em", color: "var(--navy-900)", lineHeight: 1.15, marginTop: 4 }}>Bom dia, Rafael.</div>
        <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 4 }}>4 paradas na rota SP-03. Início 10:00.</div>
      </div>

      {/* Progress card */}
      <div style={{ margin: "8px 16px 18px", padding: 16, background: "var(--white)", borderRadius: 16, border: "1px solid var(--border-1)", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {stops.map((s, i) => (
            <div key={i} style={{ flex: 1, height: 6, borderRadius: 2, background: s.status === "Concluída" ? "var(--success-500)" : s.status === "Próxima" ? "var(--sky-500)" : "var(--ink-150)" }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-3)" }}>
          <span>1 de 4 concluídas</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>29 km · ~5h</span>
        </div>
      </div>

      {/* Stop list */}
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {stops.map(s => (
          <button key={s.id} onClick={() => onOpenStop(s)} style={{
            display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 12, alignItems: "center",
            padding: 14, borderRadius: 14,
            background: "var(--white)", border: "1px solid var(--border-1)",
            boxShadow: "var(--shadow-xs)",
            textAlign: "left", cursor: "pointer", fontFamily: "inherit",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 999,
              background: s.status === "Concluída" ? "var(--success-500)" : s.status === "Próxima" ? "var(--navy-700)" : "var(--ink-150)",
              color: s.status === "Agendada" ? "var(--fg-3)" : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
            }}>
              {s.status === "Concluída" ? <MIcon name="check" size={16} color="#fff" /> : s.seq}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--navy-900)", letterSpacing: "-0.005em" }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.addr}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                <MBadge tone={s.tone} dot>{s.status}</MBadge>
                <span style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>{s.window}</span>
              </div>
            </div>
            <MIcon name="chevron-right" size={18} color="var(--fg-4)" />
          </button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { TodayScreen });
