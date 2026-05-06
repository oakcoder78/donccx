/* global React, IOSDevice */
const { useState: _useStateM } = React;

// Reusable mobile-sized Feather icon
function MIcon({ name, size = 20, color }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.feather && ref.current) {
      ref.current.innerHTML = "";
      const svgStr = window.feather.icons[name]?.toSvg({ "stroke-width": 1.5, width: size, height: size });
      if (svgStr) ref.current.innerHTML = svgStr;
    }
  }, [name, size]);
  return <span ref={ref} style={{ display: "inline-flex", color: color || "currentColor", lineHeight: 0 }} />;
}

function MBadge({ tone, children, dot = true }) {
  const tones = {
    success: { bg: "#e4f6ec", fg: "#1e7a4d" },
    warn:    { bg: "#fbf1d7", fg: "#8a6310" },
    danger:  { bg: "#fbe5e5", fg: "#9b2e2e" },
    info:    { bg: "#e0f4fc", fg: "#2a8ab4" },
    neutral: { bg: "#f3f4f6", fg: "#374151" },
  }[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11,
      padding: "3px 8px", borderRadius: 999,
      background: tones.bg, color: tones.fg,
      letterSpacing: "-0.005em",
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor" }} />}
      {children}
    </span>
  );
}

function MTabBar({ active, onChange }) {
  const tabs = [
    { id: "today", icon: "home", label: "Hoje" },
    { id: "route", icon: "map", label: "Rota" },
    { id: "history", icon: "clock", label: "Histórico" },
    { id: "profile", icon: "user", label: "Perfil" },
  ];
  return (
    <div style={{
      display: "flex", justifyContent: "space-around",
      padding: "10px 16px 26px",
      borderTop: "1px solid var(--border-1)",
      background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)",
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          border: 0, background: "transparent", cursor: "pointer",
          color: active === t.id ? "var(--navy-700)" : "var(--fg-4)",
          fontFamily: "var(--font-body)", fontWeight: active === t.id ? 600 : 500, fontSize: 10,
          padding: "4px 10px",
        }}>
          <MIcon name={t.icon} size={22} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function MHeader({ title, back, onBack, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px 14px",
      borderBottom: "1px solid var(--border-1)",
      background: "rgba(255,255,255,0.86)", backdropFilter: "blur(20px)",
    }}>
      {back && (
        <button onClick={onBack} style={{ border: 0, background: "transparent", display: "flex", alignItems: "center", gap: 2, color: "var(--navy-700)", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, padding: 4 }}>
          <MIcon name="chevron-left" size={22} />
        </button>
      )}
      <div style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17,
        color: "var(--navy-900)", letterSpacing: "-0.01em", flex: 1,
      }}>{title}</div>
      {right}
    </div>
  );
}

function MPrimaryBtn({ children, onClick, tone = "navy" }) {
  const tones = {
    navy: { bg: "var(--navy-700)", fg: "#fff" },
    accent: { bg: "var(--lime-500)", fg: "var(--navy-900)" },
  };
  const t = tones[tone];
  return (
    <button onClick={onClick} style={{
      display: "block", width: "100%",
      padding: "16px 20px", borderRadius: 14,
      border: 0, cursor: "pointer",
      background: t.bg, color: t.fg,
      fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 16,
      letterSpacing: "-0.005em",
    }}>{children}</button>
  );
}

Object.assign(window, { MIcon, MBadge, MTabBar, MHeader, MPrimaryBtn });
