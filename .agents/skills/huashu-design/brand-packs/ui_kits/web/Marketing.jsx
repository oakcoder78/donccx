/* global React, Button, Icon, Card, Badge */

function Marketing({ onEnter }) {
  return (
    <div style={{ background: "var(--white)", minHeight: "100vh" }}>
      {/* Nav */}
      <div style={{
        display: "flex", alignItems: "center", gap: 32,
        padding: "20px 40px",
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-1)",
      }}>
        <img src="../../assets/logo-donc-gradient.png" style={{ height: 24 }} />
        <nav style={{ display: "flex", gap: 28, fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, color: "var(--fg-2)" }}>
          <a>Produto</a><a>Para varejo</a><a>Para técnicos</a><a>Preços</a><a>Clientes</a>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm">Entrar</Button>
          <Button variant="primary" size="sm" onClick={onEnter}>Abrir plataforma</Button>
        </div>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 40px 80px" }}>
        <div style={{ maxWidth: 820 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sky-700)", marginBottom: 20 }}>
            Gestão de campo · Varejo de móveis e eletros
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 84,
            lineHeight: 1.02, letterSpacing: "-0.035em", color: "var(--navy-900)",
            margin: 0, textWrap: "pretty",
          }}>
            Cada entrega, sob controle.
          </h1>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 20, lineHeight: 1.55,
            color: "var(--fg-3)", margin: "28px 0 40px", maxWidth: 620,
          }}>
            Uma plataforma só para tudo que acontece depois da venda — entregas,
            montagens, instalações e assistência. Feita com quem está em campo.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <Button variant="primary" size="lg" icon="arrow-right" onClick={onEnter}>Abrir plataforma</Button>
            <Button variant="secondary" size="lg">Falar com vendas</Button>
          </div>
        </div>

        {/* Gradient accent strip */}
        <div style={{
          height: 6, width: 180, borderRadius: 999,
          background: "var(--gradient-brand)",
          marginTop: 96,
        }} />

        {/* Metric strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40, marginTop: 40 }}>
          {[
            { n: "−38%", l: "reentregas" },
            { n: "96.4%", l: "SLA cumprido" },
            { n: "< 2s", l: "para assinar uma OS" },
            { n: "48",  l: "paradas por rota" },
          ].map(m => (
            <div key={m.l}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 44, letterSpacing: "-0.03em", color: "var(--navy-900)", lineHeight: 1 }}>{m.n}</div>
              <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 8 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature strip — dark section */}
      <section style={{ background: "var(--navy-700)", color: "#fff", padding: "96px 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--lime-500)", marginBottom: 16 }}>
            O que donc faz
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 48, letterSpacing: "-0.02em", lineHeight: 1.08, margin: "0 0 60px", maxWidth: 720 }}>
            Um único lugar para toda a operação depois da venda.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40 }}>
            {[
              { ic: "map",       t: "Rotas otimizadas",     d: "Planejamento por CEP, janela do cliente e habilidade da equipe." },
              { ic: "smartphone",t: "App em campo",          d: "Checklist, fotos, assinatura e NF-e no bolso do técnico." },
              { ic: "bar-chart-2", t: "Indicadores reais", d: "SLA, reentregas, custo por OS. Exportáveis para o ERP." },
            ].map(f => (
              <div key={f.t}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.08)", color: "var(--lime-500)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  <Icon name={f.ic} size={22} />
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, letterSpacing: "-0.01em", marginBottom: 10 }}>{f.t}</div>
                <div style={{ fontSize: 15, lineHeight: 1.55, color: "rgba(255,255,255,0.72)" }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "96px 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 40, letterSpacing: "-0.025em", lineHeight: 1.1, color: "var(--navy-900)", margin: 0 }}>
              Pronto para organizar a operação?
            </h3>
            <p style={{ fontSize: 18, color: "var(--fg-3)", marginTop: 16, maxWidth: 520 }}>
              Veja donc com dados reais do seu negócio em uma chamada de 30 min.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Button variant="primary" size="lg" onClick={onEnter}>Abrir plataforma</Button>
            <Button variant="secondary" size="lg">Falar com vendas</Button>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--border-1)", padding: "32px 40px", fontSize: 13, color: "var(--fg-4)", display: "flex", gap: 24 }}>
        <img src="../../assets/logo-donc-navy.png" style={{ height: 18, opacity: 0.7 }} />
        <span>© 2026 Donc Tecnologia</span>
        <span>São Paulo, BR</span>
        <span style={{ marginLeft: "auto" }}>Privacidade · Termos</span>
      </footer>
    </div>
  );
}

Object.assign(window, { Marketing });
