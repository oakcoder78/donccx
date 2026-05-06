/* global React, MIcon, MBadge, MHeader, MPrimaryBtn */
const { useState } = React;

function StopScreen({ stop, onBack, onFinish }) {
  const [checks, setChecks] = useState({
    c1: true,  // chegada confirmada
    c2: false, // item conferido
    c3: false, // cliente presente
    c4: false, // foto do produto
  });
  const toggle = k => setChecks(x => ({ ...x, [k]: !x[k] }));
  const done = Object.values(checks).filter(Boolean).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", background: "var(--bg-subtle)" }}>
      <MHeader title={`OS #${stop?.id || "482931"}`} back onBack={onBack} right={
        <button style={{ border:0, background:"transparent", color:"var(--fg-3)", padding:4 }}><MIcon name="phone" size={20} /></button>
      } />

      {/* Hero card */}
      <div style={{ margin: "16px", padding: 16, background: "var(--navy-700)", color: "#fff", borderRadius: 16 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--lime-500)" }}>Parada 2 de 4 · próxima</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em", marginTop: 6, lineHeight: 1.2 }}>Montagem · Armário 4 portas</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>Al. dos Jurupis, 455 · Moema, SP</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: 0, background: "rgba(255,255,255,0.12)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <MIcon name="navigation" size={14} />Navegar
          </button>
          <button style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: 0, background: "var(--lime-500)", color: "var(--navy-900)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            <MIcon name="phone" size={14} />Cliente
          </button>
        </div>
      </div>

      {/* Customer */}
      <div style={{ margin: "0 16px 14px", padding: 14, background: "var(--white)", borderRadius: 14, border: "1px solid var(--border-1)", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 38, height: 38, borderRadius: 999, background: "var(--sky-100)", color: "var(--sky-700)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>MA</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--navy-900)" }}>Móveis Aurora</div>
          <div style={{ fontSize: 12, color: "var(--fg-4)" }}>Janela 11:30 – 13:00 · Apto. 82</div>
        </div>
        <MBadge tone="info" dot>Pedido #A-2821</MBadge>
      </div>

      {/* Checklist */}
      <div style={{ margin: "0 16px 14px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sky-700)", padding: "0 4px 8px" }}>Checklist · {done}/4</div>
        <div style={{ background: "var(--white)", borderRadius: 14, border: "1px solid var(--border-1)", overflow: "hidden" }}>
          {[
            { k: "c1", t: "Chegada ao local confirmada" },
            { k: "c2", t: "Itens conferidos com o romaneio" },
            { k: "c3", t: "Cliente presente e ciente" },
            { k: "c4", t: "Foto do produto montado" },
          ].map((r, i) => (
            <button key={r.k} onClick={() => toggle(r.k)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              padding: "14px 16px", border: 0, background: "transparent", cursor: "pointer",
              borderBottom: i < 3 ? "1px solid var(--divider)" : "none",
              textAlign: "left",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7,
                background: checks[r.k] ? "var(--success-500)" : "transparent",
                border: checks[r.k] ? "0" : "1.5px solid var(--border-strong)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff",
              }}>
                {checks[r.k] && <MIcon name="check" size={14} color="#fff" />}
              </div>
              <span style={{
                fontFamily: "var(--font-body)", fontSize: 14,
                color: checks[r.k] ? "var(--fg-4)" : "var(--navy-900)",
                textDecoration: checks[r.k] ? "line-through" : "none",
                letterSpacing: "-0.005em",
              }}>{r.t}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div style={{ margin: "0 16px 14px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sky-700)", padding: "0 4px 8px" }}>Fotos · 2/5 mínimas</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <div style={{ aspectRatio: "1/1", borderRadius: 12, background: "linear-gradient(135deg, #d6e9d6, #e0f4fc)" }} />
          <div style={{ aspectRatio: "1/1", borderRadius: 12, background: "linear-gradient(135deg, #e0f4fc, #f6f8d0)" }} />
          <button style={{ aspectRatio: "1/1", borderRadius: 12, border: "1.5px dashed var(--border-strong)", background: "transparent", color: "var(--fg-3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" }}>
            <MIcon name="camera" size={22} color="var(--navy-700)" />
            <span style={{ fontSize: 11, fontWeight: 600 }}>Adicionar</span>
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: "auto", padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <MPrimaryBtn onClick={onFinish} tone="accent">Finalizar OS</MPrimaryBtn>
        <button style={{ padding: 14, borderRadius: 14, border: "1px solid var(--border-2)", background: "var(--white)", color: "var(--navy-700)", fontFamily: "inherit", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
          Registrar ocorrência
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { StopScreen });
