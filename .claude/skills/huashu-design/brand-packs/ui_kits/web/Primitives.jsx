/* global React */
const { useState } = React;

// ---------- Button ----------
function Button({ variant = "primary", size = "md", icon, children, onClick, disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 8,
    fontFamily: "var(--font-body)", fontWeight: 600,
    border: "1px solid transparent", cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: "var(--r-pill)", letterSpacing: "-0.005em",
    transition: "background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
    opacity: disabled ? 0.4 : 1,
  };
  const sizes = {
    sm: { padding: "6px 12px", fontSize: 13 },
    md: { padding: "10px 18px", fontSize: 14 },
    lg: { padding: "14px 24px", fontSize: 16 },
  };
  const variants = {
    primary: { background: "var(--navy-700)", color: "#fff" },
    accent: { background: "var(--lime-500)", color: "var(--navy-900)" },
    secondary: { background: "var(--white)", color: "var(--navy-700)", borderColor: "var(--border-2)" },
    ghost: { background: "transparent", color: "var(--navy-700)" },
    danger: { background: "var(--white)", color: "var(--danger-500)", borderColor: "var(--border-2)" },
  };
  return (
    <button style={{ ...base, ...sizes[size], ...variants[variant] }} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

// ---------- Icon (Feather via global) ----------
function Icon({ name, size = 16, color }) {
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

// ---------- Badge ----------
function Badge({ variant = "neutral", children, dot = false }) {
  const styles = {
    success: { bg: "var(--success-100)", fg: "#1e7a4d" },
    warn:    { bg: "var(--warning-100)", fg: "#8a6310" },
    danger:  { bg: "var(--danger-100)",  fg: "#9b2e2e" },
    info:    { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
    neutral: { bg: "var(--ink-100)",     fg: "var(--ink-700)" },
    accent:  { bg: "var(--lime-100)",    fg: "var(--lime-700)" },
    outline: { bg: "transparent",        fg: "var(--fg-3)", ring: true },
  };
  const s = styles[variant];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 12,
      padding: "4px 10px", borderRadius: "var(--r-pill)",
      background: s.bg, color: s.fg,
      boxShadow: s.ring ? "inset 0 0 0 1px var(--border-2)" : "none",
      letterSpacing: "-0.005em",
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />}
      {children}
    </span>
  );
}

// ---------- Card ----------
function Card({ children, padding = 20, dark = false, style = {} }) {
  return (
    <div style={{
      background: dark ? "var(--navy-700)" : "var(--white)",
      color: dark ? "#fff" : "var(--fg-2)",
      border: dark ? "0" : "1px solid var(--border-1)",
      borderRadius: "var(--r-lg)",
      padding,
      boxShadow: dark ? "var(--shadow-md)" : "var(--shadow-sm)",
      ...style,
    }}>{children}</div>
  );
}

// ---------- Input ----------
function Input({ icon, placeholder, value, onChange, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--white)",
      border: `1px solid ${focused ? "var(--sky-500)" : "var(--border-2)"}`,
      boxShadow: focused ? "0 0 0 3px var(--focus-ring)" : "none",
      borderRadius: "var(--r-md)",
      padding: "0 14px", height: 44,
      transition: "border-color var(--dur-fast) var(--ease-out)",
    }}>
      {icon && <span style={{ color: "var(--fg-4)", display: "inline-flex" }}><Icon name={icon} size={16} /></span>}
      <input
        {...rest}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          flex: 1, border: 0, outline: 0, background: "transparent",
          fontFamily: "var(--font-body)", fontSize: 15, color: "var(--navy-900)",
          letterSpacing: "-0.005em",
        }}
      />
    </label>
  );
}

// ---------- IconButton ----------
function IconButton({ icon, onClick, title }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 10,
      border: "1px solid var(--border-2)", background: "var(--white)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--fg-3)", cursor: "pointer",
    }}>
      <Icon name={icon} size={16} />
    </button>
  );
}

// ---------- Avatar ----------
function Avatar({ initials, size = 36, tone = "sky" }) {
  const tones = {
    sky: { bg: "var(--sky-100)", fg: "var(--sky-700)" },
    lime: { bg: "var(--lime-100)", fg: "var(--lime-700)" },
    navy: { bg: "var(--navy-700)", fg: "#fff" },
    mint: { bg: "var(--mint-300)", fg: "var(--navy-700)" },
  };
  const t = tones[tone];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: t.bg, color: t.fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-display)", fontWeight: 700, fontSize: size * 0.36,
    }}>{initials}</div>
  );
}

// ---------- Stat ----------
function Stat({ eyebrow, value, unit, delta, deltaTone = "up", sub, dark = false }) {
  return (
    <Card dark={dark}>
      <div style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10,
        letterSpacing: "0.08em", textTransform: "uppercase",
        color: dark ? "var(--lime-500)" : "var(--sky-700)",
        marginBottom: 8,
      }}>{eyebrow}</div>
      <div style={{
        fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 40,
        letterSpacing: "-0.03em", lineHeight: 1,
        color: dark ? "#fff" : "var(--navy-900)",
      }}>{value}{unit && <span style={{ fontSize: 22, opacity: 0.7 }}>{unit}</span>}</div>
      {delta && (
        <div style={{
          fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13,
          color: deltaTone === "up"
            ? (dark ? "var(--lime-500)" : "var(--success-500)")
            : "var(--danger-500)",
          marginTop: 6,
        }}>
          {deltaTone === "up" ? "↑" : "↓"} {delta}
        </div>
      )}
      {sub && (
        <div style={{
          fontSize: 13, marginTop: 4,
          color: dark ? "rgba(255,255,255,0.72)" : "var(--fg-3)",
        }}>{sub}</div>
      )}
    </Card>
  );
}

Object.assign(window, { Button, Icon, Badge, Card, Input, IconButton, Avatar, Stat });
