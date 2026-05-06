/* global React, Button, Icon, Badge, Card, Input, IconButton, Avatar */
const { useState } = React;

function Sidebar({ active, onChange }) {
  const items = [
    { id: "overview", label: "Visão geral", icon: "home" },
    { id: "orders",   label: "Ordens",      icon: "clipboard", count: 128 },
    { id: "routes",   label: "Rotas",       icon: "map" },
    { id: "teams",    label: "Equipes",     icon: "users" },
    { id: "reports",  label: "Relatórios",  icon: "bar-chart-2" },
    { id: "settings", label: "Ajustes",     icon: "settings" },
  ];
  return (
    <aside style={{
      width: 240, flex: "0 0 240px",
      background: "var(--white)", borderRight: "1px solid var(--border-1)",
      padding: "20px 14px", display: "flex", flexDirection: "column", gap: 2,
      height: "100vh", position: "sticky", top: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px 18px", borderBottom: "1px solid var(--divider)", marginBottom: 10 }}>
        <img src="../../assets/logo-donc-navy.png" style={{ height: 22 }} />
      </div>
      {items.map(it => (
        <button key={it.id} onClick={() => onChange(it.id)} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px", borderRadius: "var(--r-md)",
          fontFamily: "var(--font-body)", fontWeight: active === it.id ? 600 : 500, fontSize: 13,
          color: active === it.id ? "#fff" : "var(--fg-2)",
          background: active === it.id ? "var(--navy-700)" : "transparent",
          border: 0, textAlign: "left", cursor: "pointer", width: "100%",
        }}>
          <Icon name={it.icon} size={16} />
          <span>{it.label}</span>
          {it.count && <span style={{
            marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11,
            color: active === it.id ? "rgba(255,255,255,0.7)" : "var(--fg-4)",
          }}>{it.count}</span>}
        </button>
      ))}
      <div style={{ marginTop: "auto", padding: "14px 10px", borderTop: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar initials="RM" size={32} tone="sky" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--navy-900)" }}>Rafael M.</div>
          <div style={{ fontSize: 11, color: "var(--fg-4)" }}>Operações · SP</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ title, breadcrumb, actions }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "20px 32px",
      borderBottom: "1px solid var(--border-1)",
      background: "rgba(255,255,255,0.72)",
      backdropFilter: "blur(20px)",
      position: "sticky", top: 0, zIndex: 5,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumb && (
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg-4)", marginBottom: 4 }}>
            {breadcrumb}
          </div>
        )}
        <h1 style={{
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24,
          letterSpacing: "-0.02em", color: "var(--navy-900)", margin: 0,
        }}>{title}</h1>
      </div>
      <div style={{ width: 320 }}>
        <Input icon="search" placeholder="Buscar OS, cliente, técnico…" />
      </div>
      {actions}
    </div>
  );
}

function Shell({ children, active, onChange, title, breadcrumb, actions }) {
  return (
    <div style={{ display: "flex", background: "var(--bg-subtle)", minHeight: "100vh" }}>
      <Sidebar active={active} onChange={onChange} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar title={title} breadcrumb={breadcrumb} actions={actions} />
        <main style={{ padding: 32, maxWidth: 1360, width: "100%", boxSizing: "border-box" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, Shell });
