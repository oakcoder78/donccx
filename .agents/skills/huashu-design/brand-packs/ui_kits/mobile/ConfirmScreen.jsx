/* global React, MIcon, MPrimaryBtn */

function ConfirmScreen({ onBack }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--white)" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 28px", textAlign: "center", gap: 18 }}>
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          background: "var(--mint-300)", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 0 10px var(--mint-100)",
        }}>
          <MIcon name="check" size={44} color="var(--navy-700)" />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, letterSpacing: "-0.025em", color: "var(--navy-900)", lineHeight: 1.1 }}>OS finalizada</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--fg-3)", marginTop: 8, maxWidth: 260, margin: "8px auto 0" }}>
            Assinatura e fotos enviadas. A próxima parada está a 6 min.
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-4)", marginTop: 4 }}>OS #482931 · 12:47</div>
      </div>
      <div style={{ padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <MPrimaryBtn onClick={onBack} tone="navy">Próxima parada</MPrimaryBtn>
        <button onClick={onBack} style={{ padding: 14, borderRadius: 14, border: 0, background: "transparent", color: "var(--navy-700)", fontFamily: "inherit", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
          Voltar para Hoje
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { ConfirmScreen });
