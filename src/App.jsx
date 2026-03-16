import { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL ?? "/api";

// ── Auth helpers ───────────────────────────────────────────
function getToken() { return localStorage.getItem("wp_token"); }
function clearToken() { localStorage.removeItem("wp_token"); }
function saveToken(t) { localStorage.setItem("wp_token", t); }

// Module-level unauth callback — set by App component
let _onUnauth = null;

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && _onUnauth) _onUnauth();
  return res;
}

const C = {
  bg:           "#ffffff",
  pageBg:       "#f1f5f9",
  cardBg:       "#ffffff",
  border:       "#e2e8f0",
  borderLight:  "#f1f5f9",
  text:         "#0f172a",
  textSub:      "#64748b",
  textMuted:    "#94a3b8",
  accent:       "#dc2626",
  accentBg:     "rgba(220, 38, 38, 0.06)",
  accentBorder: "rgba(220, 38, 38, 0.2)",
  rowHover:     "#f8fafc",
  inputBg:      "#f8fafc",
  sans:         "'Inter', system-ui, -apple-system, sans-serif",
  mono:         "'JetBrains Mono', 'DM Mono', ui-monospace, monospace",
};

const STATUS_CONFIG = {
  Valid:    { color: "#16a34a", bg: "#f0fdf4", label: "VALID",    icon: "✓" },
  Warning:  { color: "#ca8a04", bg: "#fefce8", label: "WARNING",  icon: "⚠" },
  Critical: { color: "#f97316", bg: "#fff7ed", label: "EXPIRING", icon: "!" },
  Expired:  { color: "#b91c1c", bg: "#fff1f2", label: "EXPIRED",  icon: "✗" },
};

function daysColor(days) {
  if (days < 0)  return "#b91c1c";
  if (days < 30) return "#f97316";
  if (days < 90) return "#ca8a04";
  return "#16a34a";
}

const NATIONALITIES = [
  "Afghan","Albanian","Algerian","American","Argentinian","Australian","Austrian","Bahraini",
  "Bangladeshi","Belgian","Brazilian","British","Bulgarian","Cambodian","Canadian","Chilean",
  "Chinese","Colombian","Croatian","Cuban","Czech","Danish","Dutch","Egyptian","Ethiopian",
  "Filipino","Finnish","French","German","Ghanaian","Greek","Hungarian","Indian","Indonesian",
  "Iranian","Iraqi","Irish","Italian","Ivorian","Jamaican","Japanese","Jordanian","Kenyan",
  "Korean","Kuwaiti","Lebanese","Libyan","Malaysian","Maldivian","Mauritanian","Mexican",
  "Moroccan","Mozambican","Myanmar","Namibian","Nepalese","New Zealander","Nigerian","Norwegian",
  "Omani","Pakistani","Palestinian","Peruvian","Polish","Portuguese","Qatari","Romanian",
  "Russian","Rwandan","Saudi","Senegalese","Serbian","Singaporean","Somali","South African",
  "Spanish","Sri Lankan","Sudanese","Swedish","Swiss","Syrian","Taiwanese","Tanzanian",
  "Thai","Tunisian","Turkish","Ugandan","Ukrainian","Emirati","Uruguayan","Venezuelan",
  "Vietnamese","Yemeni","Zambian","Zimbabwean"
];

function addMonths(fromDateStr, months) {
  const base = fromDateStr ? new Date(fromDateStr) : new Date();
  if (base < new Date()) { base.setTime(new Date().getTime()); }
  base.setMonth(base.getMonth() + months);
  return base.toISOString().split("T")[0];
}
function addYears(fromDateStr, years) {
  const base = fromDateStr ? new Date(fromDateStr) : new Date();
  if (base < new Date()) { base.setTime(new Date().getTime()); }
  base.setFullYear(base.getFullYear() + years);
  return base.toISOString().split("T")[0];
}

function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const useFetch = (url) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refetch = useCallback(() => {
    setLoading(true);
    apiFetch(url)
      .then(r => r.status === 401 ? null : r.json())
      .then(d => { if (d !== null) { setData(d); setLoading(false); } })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [url]);
  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
};

// ── Global Styles (animations + mobile) ──────────────────
function GlobalStyles() {
  useEffect(() => {
    const id = "docguard-global-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes fadeScaleIn {
        from { opacity: 0; transform: scale(0.96) translateY(6px); }
        to   { opacity: 1; transform: scale(1)    translateY(0); }
      }
      @keyframes slideInUp {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideTab {
        from { opacity: 0; transform: translateX(8px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes barFill {
        from { transform: scaleX(0); }
        to   { transform: scaleX(1); }
      }
      @keyframes toastIn {
        from { opacity: 0; transform: translateX(110%); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes pulseBadge {
        0%, 100% { opacity: 1; box-shadow: none; }
        50%       { opacity: 0.65; box-shadow: 0 0 6px rgba(107,114,128,0.5); }
      }
      @keyframes pulseRed {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.6; }
      }
      @keyframes shimmerAmber {
        0%   { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes cardBgPulse {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      .dg-stat-card-gradient {
        background-size: 300% 300% !important;
        animation: cardBgPulse 6s ease infinite;
      }

      /* Mobile base */
      @media (max-width: 768px) {
        .dg-stat-grid   { grid-template-columns: repeat(2, 1fr) !important; }
        .dg-doc-grid    { grid-template-columns: repeat(2, 1fr) !important; }
        .dg-tabs        { overflow-x: auto !important; width: 100% !important; -webkit-overflow-scrolling: touch; }
        .dg-table-wrap  { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        .dg-modal-inner { min-width: unset !important; max-width: 96vw !important; width: 96vw !important; padding: 20px 16px !important; border-radius: 12px !important; }
        .dg-form-grid   { grid-template-columns: 1fr !important; }
        .dg-header      { padding: 0 16px !important; flex-wrap: wrap; min-height: 52px !important; height: auto !important; gap: 10px !important; }
        .dg-main        { padding: 16px !important; }
        .dg-emp-toolbar { flex-direction: column !important; gap: 10px !important; }
        .dg-emp-actions { flex-wrap: wrap !important; gap: 8px !important; }
        .dg-search-input { max-width: 100% !important; }
        .dg-alert-grid  { grid-template-columns: 70px 1fr 120px 90px 80px !important; }
      }
      @media (max-width: 480px) {
        .dg-stat-grid   { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
        .dg-doc-grid    { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
        .dg-tabs button { padding: 7px 12px !important; font-size: 12px !important; }
        .dg-modal-inner { padding: 16px 12px !important; }
        .dg-alert-grid  { grid-template-columns: 70px 1fr 90px !important; }
        .dg-alert-grid .dg-col-site,
        .dg-alert-grid .dg-col-days { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);
  return null;
}

// ── Badge ─────────────────────────────────────────────────
const Badge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Valid;
  const isExpired = status === "Expired";
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}22`,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      fontFamily: C.sans, whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 4,
      animation: isExpired ? "pulseBadge 2.4s ease-in-out infinite" : undefined,
    }}>{cfg.icon} {cfg.label}</span>
  );
};

// ── Stat Card ─────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent, glow, onClick }) => {
  const [displayed, setDisplayed] = useState(0);
  const prevValue = useRef(null);

  useEffect(() => {
    if (value == null) return;
    const target = Number(value);
    if (prevValue.current === target) return;
    prevValue.current = target;
    if (target === 0) { setDisplayed(0); return; }
    const duration = 700;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(ease * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  const a = accent || "#64748b";
  // Animated gradient background: shifts between white and tinted accent
  const gradientBg = `linear-gradient(135deg, #ffffff 0%, ${a}18 40%, ${a}10 60%, #ffffff 100%)`;

  return (
    <div
      className="dg-stat-card-gradient"
      onClick={onClick}
      onMouseEnter={onClick ? e => {
        e.currentTarget.style.transform = "translateY(-3px) scale(1.015)";
        e.currentTarget.style.boxShadow = `0 12px 32px ${a}35, 0 2px 8px rgba(0,0,0,0.08)`;
        e.currentTarget.style.borderColor = a;
      } : undefined}
      onMouseLeave={onClick ? e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = `0 4px 20px ${a}20, 0 1px 4px rgba(0,0,0,0.04)`;
        e.currentTarget.style.borderColor = `${a}40`;
      } : undefined}
      style={{
        background: gradientBg,
        border: `1px solid ${a}40`,
        borderRadius: 16,
        padding: "22px 24px 18px",
        flex: 1, minWidth: 150,
        position: "relative", overflow: "hidden",
        boxShadow: `0 4px 20px ${a}20, 0 1px 4px rgba(0,0,0,0.04)`,
        transition: "box-shadow 0.2s, transform 0.18s, border-color 0.18s",
        cursor: onClick ? "pointer" : "default",
      }}>
      {/* Top accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 4,
        background: `linear-gradient(90deg, ${a}, ${a}80, ${a}40)`,
        borderRadius: "16px 16px 0 0",
      }} />
      {/* Decorative circle glow in corner */}
      <div style={{
        position: "absolute", bottom: -20, right: -20,
        width: 80, height: 80, borderRadius: "50%",
        background: `radial-gradient(circle, ${a}25 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ color: a, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, fontFamily: C.sans, opacity: 0.85 }}>{label}</div>
      <div style={{ color: a, fontSize: 38, fontWeight: 800, lineHeight: 1, fontFamily: C.mono, textShadow: `0 2px 8px ${a}30` }}>{value != null ? displayed : "—"}</div>
      {sub && <div style={{ color: C.textMuted, fontSize: 12, marginTop: 8, fontFamily: C.sans }}>{sub}</div>}
      {onClick && <div style={{ color: a, fontSize: 11, marginTop: 8, fontFamily: C.sans, fontWeight: 600, opacity: 0.65 }}>Click to view →</div>}
    </div>
  );
};

// ── Tabs ──────────────────────────────────────────────────
const Tabs = ({ tabs, active, onChange }) => (
  <div className="dg-tabs" style={{
    display: "flex", gap: 2,
    background: C.border,
    padding: 3, borderRadius: 12,
    width: "fit-content", marginBottom: 28,
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06)",
  }}>
    {tabs.map(t => (
      <button key={t} onClick={() => onChange(t)} style={{
        background: active === t ? C.bg : "transparent",
        color: active === t ? C.text : C.textSub,
        border: "none",
        padding: "8px 20px", cursor: "pointer",
        borderRadius: 9,
        fontFamily: C.sans, fontSize: 13,
        fontWeight: active === t ? 600 : 400,
        boxShadow: active === t ? "0 1px 6px rgba(0,0,0,0.1)" : "none",
        transition: "all 0.15s",
        letterSpacing: "0.01em",
      }}>{t}</button>
    ))}
  </div>
);

// ── Modal ─────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    backdropFilter: "blur(4px)",
  }} onClick={onClose}>
    <div className="dg-modal-inner" style={{
      background: C.cardBg,
      border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 32,
      minWidth: wide ? 660 : 500, maxWidth: wide ? 740 : 580,
      maxHeight: "90vh", overflowY: "auto",
      boxShadow: "0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)",
      animation: "fadeScaleIn 0.15s ease",
    }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h3 style={{ color: C.text, margin: 0, fontSize: 16, fontFamily: C.sans, fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{
          background: C.pageBg, border: `1px solid ${C.border}`,
          color: C.textMuted, width: 32, height: 32, borderRadius: 8,
          cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

// ── Input helpers ─────────────────────────────────────────
const inputStyle = (readOnly) => ({
  width: "100%", background: readOnly ? C.pageBg : C.cardBg,
  border: `1px solid ${C.border}`,
  color: readOnly ? C.textSub : C.text,
  padding: "9px 12px", borderRadius: 8,
  fontFamily: C.mono, fontSize: 13, boxSizing: "border-box", outline: "none",
  cursor: readOnly ? "default" : "text",
  transition: "border-color 0.15s",
});

const labelStyle = {
  display: "block", color: C.textSub, fontSize: 11,
  fontWeight: 500, letterSpacing: "0.05em", fontFamily: C.sans, marginBottom: 5,
  textTransform: "uppercase",
};

const InputRow = ({ label, name, type = "text", value, onChange, required, readOnly }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={labelStyle}>{label}{required && <span style={{ color: C.accent }}> *</span>}</label>
    <input type={type} name={name} value={value} onChange={onChange} required={required} readOnly={readOnly}
      style={inputStyle(readOnly)} />
  </div>
);

const SelectRow = ({ label, name, value, onChange, options, required }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={labelStyle}>{label}{required && <span style={{ color: C.accent }}> *</span>}</label>
    <select name={name} value={value} onChange={onChange} required={required}
      style={{ ...inputStyle(false), appearance: "none", cursor: "pointer" }}>
      <option value="">— Select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// ── Extend field with period quick-buttons ────────────────
// unit: "months" (1M 2M 3M 6M 12M) | "years" (1Y 2Y)
const ExtendField = ({ label, name, value, onChange, unit, required }) => {
  const options = unit === "months" ? [1, 2, 3, 6, 12] : [1, 2];
  const extend = (n) => {
    const newVal = unit === "months" ? addMonths(value, n) : addYears(value, n);
    onChange({ target: { name, value: newVal } });
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: C.accent }}> *</span>}</label>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="date" name={name} value={value} onChange={onChange}
          style={{ ...inputStyle(false), flex: 1 }} />
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {options.map(n => (
            <button key={n} type="button" onClick={() => extend(n)} style={{
              background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBorder}`,
              padding: "8px 9px", borderRadius: 7, cursor: "pointer",
              fontFamily: C.sans, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            }}>+{n}{unit === "months" ? "M" : "Y"}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Employee Detail / Edit Modal ──────────────────────────
const EmployeeDetailModal = ({ emp, sites, employers, onClose, onUpdated, onDeleted }) => {
  const [mode, setMode] = useState("VIEW");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    full_name:              emp.full_name || "",
    passport_number:        emp.passport_number || "",
    work_permit_number:     emp.work_permit_number || "",
    nationality:            emp.nationality || "",
    job_title:              emp.job_title || "",
    passport_expiry:        emp.passport_expiry || "",
    visa_stamp_expiry:      emp.visa_stamp_expiry || "",
    insurance_expiry:       emp.insurance_expiry || "",
    work_permit_fee_expiry: emp.work_permit_fee_expiry || "",
    medical_expiry:         emp.medical_expiry || "",
    quota_slot_id:          emp.quota_slot_id || "",
    note:                   "",
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resignSaving, setResignSaving] = useState(false);
  const [logs, setLogs] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [renewMode, setRenewMode] = useState(false);
  const [renewForm, setRenewForm] = useState({ passport_number: emp.passport_number || "", passport_expiry: emp.passport_expiry || "", note: "Passport Renewal" });
  const [renewSaving, setRenewSaving] = useState(false);
  const [renewError, setRenewError] = useState(null);
  const [siteSlots, setSiteSlots] = useState(null);

  useEffect(() => {
    if (mode === "EDIT" && siteSlots === null) {
      apiFetch(`${API}/quota-slots/?site_id=${emp.site_id}`)
        .then(r => r.json())
        .then(d => setSiteSlots(Array.isArray(d) ? d : []))
        .catch(() => setSiteSlots([]));
    }
  }, [mode]);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleModeChange = async (newMode) => {
    setMode(newMode);
    if (newMode === "HISTORY" && logs === null) {
      setLogsLoading(true);
      try {
        const res = await apiFetch(`${API}/employees/${emp.id}/logs`);
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      } catch {
        setLogs([]);
      } finally {
        setLogsLoading(false);
      }
    }
  };

  const handleSave = async () => {
    setError(null); setSaving(true);
    const payload = { ...form };
    ["passport_expiry","visa_stamp_expiry","insurance_expiry","work_permit_fee_expiry","medical_expiry"].forEach(f => {
      if (payload[f] === "") payload[f] = null;
    });
    if (payload.passport_number === "") payload.passport_number = null;
    if (payload.quota_slot_id === "" || payload.quota_slot_id === null) payload.quota_slot_id = null;
    else payload.quota_slot_id = parseInt(payload.quota_slot_id);
    if (!payload.note) delete payload.note;
    const doFetch = () => apiFetch(`${API}/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    try {
      let res;
      try { res = await doFetch(); }
      catch { res = await doFetch(); } // retry once on network failure
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail?.message || data.detail || "Error updating employee");
      } else {
        onUpdated(data);
        setMode("VIEW");
        setLogs(null);
      }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    const res = await apiFetch(`${API}/employees/${emp.id}`, { method: "DELETE" });
    if (res.ok) { onDeleted(emp.id); }
    else { const d = await res.json().catch(() => ({})); setError(d.detail || "Error deleting employee"); }
  };

  const handleToggleResigned = async () => {
    setResignSaving(true); setError(null);
    try {
      const res = await apiFetch(`${API}/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resigned: !emp.resigned }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.detail?.message || data.detail || "Error updating employee");
      else onUpdated(data);
    } catch (e) { setError(e.message); }
    finally { setResignSaving(false); }
  };

  const handleRenew = async () => {
    setRenewError(null); setRenewSaving(true);
    const payload = { passport_number: renewForm.passport_number || null, passport_expiry: renewForm.passport_expiry || null, note: renewForm.note || "Passport Renewal" };
    if (!payload.passport_expiry) payload.passport_expiry = null;
    try {
      const res = await apiFetch(`${API}/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setRenewError(data.detail?.message || data.detail || "Error saving"); }
      else { onUpdated(data); setRenewMode(false); setLogs(null); }
    } catch (e) { setRenewError(e.message); }
    finally { setRenewSaving(false); }
  };

  const employerName = (employers || []).find(e => e.id === emp.employer_id)?.name || `Employer #${emp.employer_id}`;
  const siteName     = (sites || []).find(s => s.id === emp.site_id)?.site_name || `Site #${emp.site_id}`;

  const docRows = [
    { label: "Passport",        name: "passport_expiry",        status: emp.passport_status },
    { label: "Visa Stamp",      name: "visa_stamp_expiry",      status: emp.visa_stamp_status },
    { label: "Insurance",       name: "insurance_expiry",       status: emp.insurance_status },
    { label: "Work Permit Fee", name: "work_permit_fee_expiry", status: emp.work_permit_fee_status },
    { label: "Medical",         name: "medical_expiry",         status: emp.medical_status },
  ];

  const modalTitle = mode === "EDIT"
    ? `Edit — ${emp.full_name}`
    : mode === "HISTORY"
    ? `History — ${emp.full_name}`
    : emp.full_name;

  return (
    <Modal wide title={modalTitle} onClose={onClose}>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {/* Resigned banner */}
      {emp.resigned && (
        <div style={{ background: "#f9fafb", border: "1px solid #d1d5db", color: "#6b7280", padding: "8px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🚪</span> This employee has been marked as resigned.
        </div>
      )}

      {/* Mode tab bar */}
      <div style={{ display: "flex", gap: 1, background: C.borderLight, padding: 3, borderRadius: 10, width: "fit-content", marginBottom: 24 }}>
        {["VIEW", "EDIT", "HISTORY"].map(m => (
          <button key={m} onClick={() => handleModeChange(m)} style={{
            background: mode === m ? C.bg : "transparent",
            color: mode === m ? C.text : C.textSub,
            border: "none", padding: "6px 16px", cursor: "pointer",
            borderRadius: 8, fontFamily: C.sans, fontSize: 12,
            fontWeight: mode === m ? 600 : 400,
            boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            transition: "all 0.15s",
          }}>{m}</button>
        ))}
      </div>

      {mode === "VIEW" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px", marginBottom: 20 }}>
            {[
              ["Emp No.",        emp.employee_number],
              ["Passport No.",   emp.passport_number || "—"],
              ["WP No.",         emp.work_permit_number || "—"],
              ["Employer",       employerName],
              ["Site",           siteName],
              ["Nationality",    emp.nationality || "—"],
              ["Job Title",      emp.job_title || "—"],
              ["Quota Slot",     emp.quota_slot_number || "—"],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ marginBottom: 14 }}>
                <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: C.sans, marginBottom: 3 }}>{lbl}</div>
                <div style={{ color: C.text, fontFamily: C.mono, fontSize: 13 }}>{val}</div>
              </div>
            ))}
          </div>

          {emp.quota_slot_expired && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <div>
                <strong>Quota Slot Expired</strong> — Slot <span style={{ fontFamily: C.mono }}>{emp.quota_slot_number}</span> expired on {emp.quota_slot_expiry}.
                Work Permit Fee cannot be renewed until the slot expiry is updated.
              </div>
            </div>
          )}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18, marginBottom: 20 }}>
            <div style={{ color: C.textSub, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: C.sans, marginBottom: 14 }}>Document Status</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {docRows.map(({ label, name, status }) => {
                const cfg = STATUS_CONFIG[status?.status] || null;
                return (
                  <div key={name} style={{
                    background: cfg ? cfg.bg : C.pageBg,
                    border: `1px solid ${cfg ? `${cfg.color}20` : C.border}`,
                    borderRadius: 10, padding: "12px 14px",
                    borderTop: `3px solid ${cfg ? cfg.color : C.border}`,
                  }}>
                    <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: C.sans, marginBottom: 6 }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: C.text, fontFamily: C.mono, fontSize: 12, flex: 1 }}>
                        {status?.date || "Not set"}
                      </span>
                      {status?.status && <Badge status={status.status} />}
                    </div>
                    {status?.days_remaining !== undefined && status?.days_remaining !== null && (
                      <div style={{ color: cfg?.color || C.textMuted, fontSize: 11, fontFamily: C.mono, marginTop: 5, fontWeight: 600 }}>
                        {status.days_remaining < 0
                          ? `Expired ${Math.abs(status.days_remaining)}d ago`
                          : `${status.days_remaining}d remaining`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Passport Renewal Panel */}
          {renewMode && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "16px 18px", marginBottom: 18 }}>
              <div style={{ color: "#1d4ed8", fontFamily: C.sans, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>🔄 Renew Passport</div>
              {renewError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "8px 12px", borderRadius: 7, fontSize: 12, fontFamily: C.sans, marginBottom: 12 }}>⚠ {renewError}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px" }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ ...labelStyle, color: "#1d4ed8" }}>New Passport No.</label>
                  <input value={renewForm.passport_number} onChange={e => setRenewForm(f => ({ ...f, passport_number: e.target.value }))}
                    placeholder="e.g. B98765432"
                    style={{ ...inputStyle(false), borderColor: "#bfdbfe", background: "#fff" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ ...labelStyle, color: "#1d4ed8" }}>New Expiry Date</label>
                  <input type="date" value={renewForm.passport_expiry} onChange={e => setRenewForm(f => ({ ...f, passport_expiry: e.target.value }))}
                    style={{ ...inputStyle(false), borderColor: "#bfdbfe", background: "#fff" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ ...labelStyle, color: "#1d4ed8" }}>Note</label>
                  <input value={renewForm.note} onChange={e => setRenewForm(f => ({ ...f, note: e.target.value }))}
                    style={{ ...inputStyle(false), borderColor: "#bfdbfe", background: "#fff" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setRenewMode(false); setRenewError(null); }} style={{ background: "#fff", color: C.textSub, border: `1px solid ${C.border}`, padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Cancel</button>
                <button onClick={handleRenew} disabled={renewSaving} style={{ background: "#1d4ed8", color: "#fff", border: "none", padding: "7px 20px", borderRadius: 8, cursor: renewSaving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: renewSaving ? 0.7 : 1 }}>
                  {renewSaving ? "Saving..." : "Save Renewal"}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} style={{ background: "none", color: "#dc2626", border: "1px solid #fecaca", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>
                  Delete
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: C.textSub, fontFamily: C.sans, fontSize: 12 }}>Are you sure?</span>
                  <button onClick={handleDelete} style={{ background: "#dc2626", color: "#fff", border: "none", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>Yes, Delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Cancel</button>
                </div>
              )}
              <button
                onClick={handleToggleResigned}
                disabled={resignSaving}
                style={{
                  background: emp.resigned ? "#f0fdf4" : "#f9fafb",
                  color: emp.resigned ? "#16a34a" : "#6b7280",
                  border: `1px solid ${emp.resigned ? "#bbf7d0" : "#d1d5db"}`,
                  padding: "7px 16px", borderRadius: 8, cursor: resignSaving ? "not-allowed" : "pointer",
                  fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: resignSaving ? 0.7 : 1,
                }}>
                {resignSaving ? "Saving..." : emp.resigned ? "✓ Reactivate Employee" : "Mark as Resigned"}
              </button>
              <button
                onClick={() => { setRenewMode(r => !r); setRenewError(null); setRenewForm({ passport_number: emp.passport_number || "", passport_expiry: emp.passport_expiry || "", note: "Passport Renewal" }); }}
                style={{ background: renewMode ? "#eff6ff" : "#f8fafc", color: renewMode ? "#1d4ed8" : C.textSub, border: `1px solid ${renewMode ? "#bfdbfe" : C.border}`, padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>
                🔄 Renew Passport
              </button>
            </div>
            <button onClick={() => handleModeChange("EDIT")} style={{ background: C.accent, color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>
              Edit
            </button>
          </div>
        </div>
      )}

      {mode === "EDIT" && (
        <div>
          <div className="dg-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px", marginBottom: 4 }}>
            <InputRow label="Emp No." name="_empno" value={emp.employee_number} onChange={() => {}} readOnly />
            <InputRow label="Employer" name="_employer" value={employerName} onChange={() => {}} readOnly />
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 16 }} />

          <div className="dg-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <InputRow label="Full Name" name="full_name" value={form.full_name} onChange={handleChange} required />
            <InputRow label="Passport No." name="passport_number" value={form.passport_number} onChange={handleChange} placeholder="e.g. A12345678" />
            <InputRow label="Work Permit No." name="work_permit_number" value={form.work_permit_number} onChange={handleChange} placeholder="e.g. WP-2024-00123" />
            <InputRow label="Job Title" name="job_title" value={form.job_title} onChange={handleChange} />
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Nationality</label>
              <select name="nationality" value={form.nationality} onChange={handleChange}
                style={{ ...inputStyle(false), appearance: "none", cursor: "pointer" }}>
                <option value="">— Select —</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <InputRow label="Passport Expiry" name="passport_expiry" type="date" value={form.passport_expiry} onChange={handleChange} />
            <ExtendField label="Visa Stamp Expiry"  name="visa_stamp_expiry"  value={form.visa_stamp_expiry}  onChange={handleChange} unit="years" />
            <ExtendField label="Insurance Expiry"   name="insurance_expiry"   value={form.insurance_expiry}   onChange={handleChange} unit="years" />
            <ExtendField label="Work Permit Fee Expiry" name="work_permit_fee_expiry" value={form.work_permit_fee_expiry} onChange={handleChange} unit="months" />
            <ExtendField label="Medical Expiry"     name="medical_expiry"     value={form.medical_expiry}     onChange={handleChange} unit="years" />
          </div>

          {siteSlots !== null && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Quota Slot</label>
              <select name="quota_slot_id" value={form.quota_slot_id || ""} onChange={handleChange}
                style={{ ...inputStyle(false), appearance: "none", cursor: "pointer" }}>
                <option value="">— None —</option>
                {siteSlots.map(s => {
                  const taken = s.assigned_employee_id && s.assigned_employee_id !== emp.id;
                  return (
                    <option key={s.id} value={s.id} disabled={taken}>
                      {s.slot_number}{s.expiry_date ? ` (exp: ${s.expiry_date})` : ""}{s.is_expired ? " ⚠ EXPIRED" : ""}{taken ? " — assigned" : ""}
                    </option>
                  );
                })}
              </select>
              {form.quota_slot_id && siteSlots.find(s => s.id === parseInt(form.quota_slot_id))?.is_expired && (
                <div style={{ color: "#dc2626", fontSize: 11, fontFamily: C.sans, marginTop: 4 }}>
                  ⚠ This slot is expired. Work Permit Fee updates will be blocked until the slot is renewed.
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Note <span style={{ color: C.textMuted, textTransform: "none", fontWeight: 400 }}>(optional — saved to audit log)</span></label>
            <input type="text" name="note" value={form.note} onChange={handleChange}
              placeholder="e.g. Renewed at immigration office"
              style={inputStyle(false)} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setMode("VIEW"); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ background: C.accent, color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {mode === "HISTORY" && (
        <div>
          {logsLoading ? (
            <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, padding: "32px 0", textAlign: "center" }}>Loading history...</div>
          ) : logs && logs.length === 0 ? (
            <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, padding: "32px 0", textAlign: "center" }}>No history recorded yet.</div>
          ) : (() => {
            // Group entries that share the same timestamp (same operation/save)
            const groups = [];
            (logs || []).forEach(log => {
              const tsKey = (log.changed_at || "").substring(0, 19);
              const last = groups[groups.length - 1];
              if (last && last.tsKey === tsKey) { last.entries.push(log); }
              else { groups.push({ tsKey, entries: [log] }); }
            });
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {groups.map((group, gi) => {
                  const first = group.entries[0];
                  const note = first.note;
                  const isRenewal = note && note.toLowerCase().includes("passport renewal");
                  const accentColor = isRenewal ? "#1d4ed8" : C.accent;
                  const bg = isRenewal ? "#eff6ff" : C.pageBg;
                  const borderColor = isRenewal ? "#bfdbfe" : C.border;
                  return (
                    <div key={gi} style={{ background: bg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${accentColor}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {isRenewal && <span style={{ background: "#1d4ed8", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, fontFamily: C.sans, letterSpacing: "0.04em" }}>PASSPORT RENEWAL</span>}
                          {!isRenewal && group.entries.length > 1 && <span style={{ background: C.border, color: C.textSub, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, fontFamily: C.sans }}>{group.entries.length} changes</span>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                          <span style={{ color: C.textMuted, fontFamily: C.mono, fontSize: 11 }}>{formatDateTime(first.changed_at)}</span>
                          {first.changed_by && <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 10 }}>by {first.changed_by}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {group.entries.map((log, li) => (
                          <div key={log.id || li}>
                            <div style={{ color: accentColor, fontFamily: C.sans, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{log.field_name}</div>
                            <div style={{ fontFamily: C.mono, fontSize: 12 }}>
                              <span style={{ color: C.textSub }}>{log.old_value ?? "—"}</span>
                              <span style={{ color: C.textMuted, margin: "0 10px" }}>→</span>
                              <span style={{ color: C.text, fontWeight: 600 }}>{log.new_value ?? "—"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {note && <div style={{ color: isRenewal ? "#1d4ed8" : C.textSub, fontFamily: C.sans, fontSize: 12, fontStyle: "italic", marginTop: 8 }}>"{note}"</div>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </Modal>
  );
};

// ── Quota Slots Panel ─────────────────────────────────────
const QuotaSlotsPanel = ({ site, onClose }) => {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addData, setAddData] = useState({ slot_number: "", expiry_date: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ slot_number: "", expiry_date: "" });

  const fetchSlots = () => {
    apiFetch(`${API}/quota-slots/?site_id=${site.id}`)
      .then(r => r.json())
      .then(d => setSlots(Array.isArray(d) ? d : []))
      .catch(() => setSlots([]));
  };

  useEffect(() => { fetchSlots(); }, []);

  const handleAdd = async () => {
    if (!addData.slot_number.trim()) { setError("Slot number is required"); return; }
    setError(null); setSaving(true);
    try {
      const res = await apiFetch(`${API}/quota-slots/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: site.id, slot_number: addData.slot_number.trim(), expiry_date: addData.expiry_date || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail?.message || data.detail || "Error creating slot"); }
      else { setAddData({ slot_number: "", expiry_date: "" }); setShowAdd(false); fetchSlots(); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (slotId) => {
    if (!editForm.slot_number.trim()) { setError("Slot number is required"); return; }
    setError(null); setSaving(true);
    try {
      const res = await apiFetch(`${API}/quota-slots/${slotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_number: editForm.slot_number.trim(), expiry_date: editForm.expiry_date || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail?.message || data.detail || "Error updating slot"); }
      else { setEditingId(null); fetchSlots(); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (slotId) => {
    setError(null);
    const res = await apiFetch(`${API}/quota-slots/${slotId}`, { method: "DELETE" });
    if (res.ok) { fetchSlots(); }
    else { const d = await res.json().catch(() => ({})); setError(d.detail || "Error deleting slot"); }
  };

  return (
    <Modal wide title={`Quota Slots — ${site.site_name}`} onClose={onClose}>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 14 }}>
          ⚠ {error}
        </div>
      )}

      {/* Add slot form */}
      {showAdd ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ color: "#15803d", fontFamily: C.sans, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Quota Slot</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ ...labelStyle, color: "#15803d" }}>Slot Number *</label>
              <input value={addData.slot_number} onChange={e => setAddData(d => ({ ...d, slot_number: e.target.value }))}
                placeholder="e.g. QS00301620"
                style={{ ...inputStyle(false), borderColor: "#bbf7d0", background: "#fff" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ ...labelStyle, color: "#15803d" }}>Expiry Date</label>
              <input type="date" value={addData.expiry_date} onChange={e => setAddData(d => ({ ...d, expiry_date: e.target.value }))}
                style={{ ...inputStyle(false), borderColor: "#bbf7d0", background: "#fff" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowAdd(false); setError(null); }} style={{ background: "#fff", color: C.textSub, border: `1px solid ${C.border}`, padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Cancel</button>
            <button onClick={handleAdd} disabled={saving} style={{ background: "#16a34a", color: "#fff", border: "none", padding: "7px 20px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving..." : "Add Slot"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowAdd(true); setError(null); }} style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          + Add Quota Slot
        </button>
      )}

      {/* Slots list */}
      {slots === null ? (
        <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, padding: "24px 0", textAlign: "center" }}>Loading...</div>
      ) : slots.length === 0 ? (
        <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, padding: "24px 0", textAlign: "center" }}>No quota slots defined yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {slots.map(slot => {
            const expired = slot.is_expired;
            const borderColor = expired ? "#fca5a5" : slot.expiry_date ? "#d1d5db" : C.border;
            const topColor = expired ? "#dc2626" : slot.expiry_date ? "#16a34a" : C.border;
            return (
              <div key={slot.id} style={{ background: C.bg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: "12px 14px", borderTop: `3px solid ${topColor}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: C.text }}>{slot.slot_number}</span>
                      {expired && <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontFamily: C.sans, fontWeight: 700 }}>EXPIRED</span>}
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span style={{ color: expired ? "#dc2626" : C.textSub, fontFamily: C.mono, fontSize: 12 }}>
                        Expiry: {slot.expiry_date || "—"}
                      </span>
                      <span style={{ color: slot.assigned_employee_name ? C.accent : C.textMuted, fontFamily: C.sans, fontSize: 12 }}>
                        {slot.assigned_employee_name ? `Assigned: ${slot.assigned_employee_name}` : "Unassigned"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => { setEditingId(slot.id); setEditForm({ slot_number: slot.slot_number, expiry_date: slot.expiry_date || "" }); setError(null); }}
                      style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontFamily: C.sans, fontSize: 11, fontWeight: 600 }}>
                      Edit
                    </button>
                    {!slot.assigned_employee_id && (
                      <button
                        onClick={() => handleDelete(slot.id)}
                        style={{ background: "none", color: "#dc2626", border: "1px solid #fecaca", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: C.sans, fontSize: 11, fontWeight: 600 }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {editingId === slot.id && (
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                    <div>
                      <label style={labelStyle}>Slot Number *</label>
                      <input value={editForm.slot_number} onChange={e => setEditForm(f => ({ ...f, slot_number: e.target.value }))}
                        style={inputStyle(false)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Expiry Date</label>
                      <input type="date" value={editForm.expiry_date} onChange={e => setEditForm(f => ({ ...f, expiry_date: e.target.value }))}
                        style={inputStyle(false)} />
                    </div>
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                      <button onClick={() => setEditingId(null)} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Cancel</button>
                      <button onClick={() => handleUpdate(slot.id)} disabled={saving}
                        style={{ background: C.accent, color: "#fff", border: "none", padding: "7px 16px", borderRadius: 7, cursor: saving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

// ── Site Card ─────────────────────────────────────────────
const SiteCard = ({ site, onViewEmployees, onSlotsChanged, onSiteUpdated }) => {
  const [showSlots, setShowSlots] = useState(false);
  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaValue, setQuotaValue] = useState(String(site.total_quota_slots));
  const [quotaError, setQuotaError] = useState(null);
  const [quotaSaving, setQuotaSaving] = useState(false);

  const pct = site.quota_utilisation_pct;
  const atCapacity = site.available_slots === 0;
  const barColor = pct >= 100 ? "#dc2626" : pct >= 80 ? "#d97706" : "#16a34a";

  const handleSaveQuota = async () => {
    const val = parseInt(quotaValue);
    if (!val || val < 1) { setQuotaError("Must be at least 1"); return; }
    setQuotaError(null); setQuotaSaving(true);
    try {
      const res = await apiFetch(`${API}/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_quota_slots: val }),
      });
      const data = await res.json();
      if (!res.ok) { setQuotaError(data.detail || "Error updating quota"); }
      else { setEditingQuota(false); onSiteUpdated && onSiteUpdated(data); }
    } catch (e) { setQuotaError(e.message); }
    finally { setQuotaSaving(false); }
  };

  return (
    <>
    <div style={{
      background: C.bg, border: `1px solid ${atCapacity ? "#fca5a5" : C.border}`,
      borderRadius: 10, padding: "14px 18px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ color: C.text, fontFamily: C.sans, fontSize: 14, fontWeight: 600, flex: 1 }}>{site.site_name}</div>
        {atCapacity && <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontFamily: C.sans, fontWeight: 700 }}>QUOTA FULL</span>}
        <button
          onClick={() => setShowSlots(true)}
          style={{
            background: "#f0fdf4", color: "#16a34a",
            border: "1px solid #bbf7d0",
            padding: "3px 12px", borderRadius: 20, cursor: "pointer",
            fontFamily: C.sans, fontSize: 11, fontWeight: 600,
          }}
          title="Manage quota slots">
          Quota Slots
        </button>
        <button
          onClick={() => onViewEmployees && onViewEmployees(site)}
          style={{
            background: C.pageBg, color: C.textSub,
            border: `1px solid ${C.border}`,
            padding: "3px 12px", borderRadius: 20, cursor: "pointer",
            fontFamily: C.mono, fontSize: 12, fontWeight: 600,
          }}
          title="View assigned employees">
          {site.used_slots} / {site.total_quota_slots} slots
        </button>
        <button
          onClick={() => { setEditingQuota(true); setQuotaValue(String(site.total_quota_slots)); setQuotaError(null); }}
          style={{
            background: C.pageBg, color: C.textSub,
            border: `1px solid ${C.border}`,
            padding: "3px 10px", borderRadius: 20, cursor: "pointer",
            fontFamily: C.sans, fontSize: 11,
          }}
          title="Edit total quota">
          ✏
        </button>
      </div>
      {editingQuota && (
        <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: C.textSub, fontFamily: C.sans, fontSize: 12 }}>Total slots:</span>
          <input
            type="number" min="1" value={quotaValue}
            onChange={e => setQuotaValue(e.target.value)}
            style={{ ...inputStyle(false), width: 80, padding: "5px 10px" }}
          />
          {quotaError && <span style={{ color: "#dc2626", fontFamily: C.sans, fontSize: 12 }}>{quotaError}</span>}
          <button onClick={handleSaveQuota} disabled={quotaSaving}
            style={{ background: C.accent, color: "#fff", border: "none", padding: "5px 14px", borderRadius: 7, cursor: quotaSaving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: quotaSaving ? 0.7 : 1 }}>
            {quotaSaving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => { setEditingQuota(false); setQuotaError(null); }}
            style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>
            Cancel
          </button>
        </div>
      )}
      <div style={{ background: C.borderLight, borderRadius: 4, height: 6, overflow: "hidden", marginBottom: 6 }}>
        <div style={{
          height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 4,
          background: pct >= 80 && pct < 100
            ? `linear-gradient(90deg, ${barColor}, ${barColor}bb, ${barColor})`
            : barColor,
          backgroundSize: pct >= 80 && pct < 100 ? "200% 100%" : undefined,
          transformOrigin: "left center",
          animation: pct >= 100
            ? "barFill 0.8s ease-out, pulseRed 1.8s ease-in-out 0.8s infinite"
            : pct >= 80
            ? "barFill 0.8s ease-out, shimmerAmber 2s linear 0.8s infinite"
            : "barFill 0.8s ease-out",
        }} />
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, fontFamily: C.sans }}>{pct}% utilisation · {site.available_slots} slots available</div>
    </div>
    {showSlots && <QuotaSlotsPanel site={site} onClose={() => { setShowSlots(false); onSlotsChanged && onSlotsChanged(); }} />}
    </>
  );
};

// ── Days Pill ─────────────────────────────────────────────
const DaysPill = ({ days }) => {
  const color = daysColor(days);
  const label = days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`;
  return (
    <span style={{
      background: `${color}12`, color, border: `1px solid ${color}35`,
      padding: "3px 10px", borderRadius: 20, fontSize: 11,
      fontFamily: C.mono, fontWeight: 700, whiteSpace: "nowrap",
    }}>{label}</span>
  );
};

// ── Category Section ──────────────────────────────────────
const CATEGORY_META = {
  "PASSPORTS":       { color: "#2563eb", icon: "🛂" },
  "WORK PERMIT FEE": { color: "#f97316", icon: "📋" },
  "INSURANCE":       { color: "#ca8a04", icon: "🛡" },
  "VISA STAMP":      { color: "#a855f7", icon: "🔖" },
  "MEDICAL":         { color: "#0891b2", icon: "🏥" },
};

const CategorySection = ({ title, alerts, onEmployeeClick }) => {
  const storageKey = `cat_expanded_${title}`;
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(storageKey) !== "false"; } catch { return true; }
  });
  const toggle = () => setExpanded(e => {
    const next = !e;
    try { localStorage.setItem(storageKey, next); } catch {}
    return next;
  });

  const count = alerts ? alerts.length : 0;
  const expired  = (alerts || []).filter(a => a.status === "Expired").length;
  const critical = (alerts || []).filter(a => a.status === "Critical").length;
  const warning  = (alerts || []).filter(a => a.status === "Warning").length;
  const hasUrgent = expired > 0 || critical > 0;
  const meta = CATEGORY_META[title] || { color: C.textMuted, icon: "•" };
  const worstStatusColor = count === 0 ? "#16a34a" : expired > 0 ? "#b91c1c" : critical > 0 ? "#f97316" : warning > 0 ? "#ca8a04" : "#16a34a";

  const byEmployer = {};
  (alerts || []).forEach(a => {
    const key = a.employer_name || "Unknown";
    if (!byEmployer[key]) byEmployer[key] = [];
    byEmployer[key].push(a);
  });
  const employerGroups = Object.entries(byEmployer).sort((a, b) => b[1].length - a[1].length);

  return (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${count > 0 ? `${worstStatusColor}35` : C.border}`,
      borderLeft: `4px solid ${worstStatusColor}`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: count > 0 ? `0 2px 12px ${worstStatusColor}12` : "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {/* Section header */}
      <div onClick={toggle} style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 18px 13px 16px",
        background: count > 0 ? `${worstStatusColor}06` : C.pageBg,
        borderBottom: expanded && count > 0 ? `1px solid ${C.border}` : "none",
        cursor: "pointer", userSelect: "none",
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{meta.icon}</span>
        <span style={{ color: C.text, fontFamily: C.sans, fontSize: 13, fontWeight: 700, flex: 1 }}>{title}</span>
        {count === 0 ? (
          <span style={{ color: "#16a34a", fontFamily: C.sans, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 14 }}>✓</span> All clear
          </span>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {expired > 0  && <span style={{ background: "#fff1f2", color: "#b91c1c", border: "1px solid #fecaca",  padding: "2px 9px", borderRadius: 20, fontSize: 11, fontFamily: C.sans, fontWeight: 700 }}>{expired} expired</span>}
            {critical > 0 && <span style={{ background: "#fff7ed", color: "#f97316", border: "1px solid #fed7aa",  padding: "2px 9px", borderRadius: 20, fontSize: 11, fontFamily: C.sans, fontWeight: 700 }}>{critical} expiring</span>}
            {warning > 0  && <span style={{ background: "#fefce8", color: "#ca8a04", border: "1px solid #fde68a",  padding: "2px 9px", borderRadius: 20, fontSize: 11, fontFamily: C.sans, fontWeight: 700 }}>{warning} warning</span>}
          </div>
        )}
        <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 4, transition: "transform 0.2s", display: "inline-block", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </div>

      {expanded && count > 0 && (
        <div>
          {/* Column header */}
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 160px 110px 100px", gap: 0, padding: "7px 18px 7px 18px", background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
            {["STATUS", "EMPLOYEE", "SITE", "EXPIRY DATE", "DAYS"].map(h => (
              <span key={h} style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          {employerGroups.map(([employer, rows], gi) => (
            <div key={employer}>
              {/* Employer group header */}
              <div style={{
                padding: "6px 18px",
                background: "#fafafa",
                borderBottom: `1px solid ${C.borderLight}`,
                borderTop: gi > 0 ? `1px solid ${C.borderLight}` : "none",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ color: C.textSub, fontFamily: C.sans, fontSize: 11, fontWeight: 700 }}>{employer}</span>
                <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11 }}>— {rows.length} {rows.length === 1 ? "employee" : "employees"}</span>
              </div>
              {/* Employee rows */}
              {rows.sort((a, b) => a.days_remaining - b.days_remaining).map((a, i) => (
                <div key={i}
                  onClick={() => onEmployeeClick && onEmployeeClick(a.employee_id)}
                  style={{
                    display: "grid", gridTemplateColumns: "90px 1fr 160px 110px 100px",
                    alignItems: "center",
                    padding: "10px 18px",
                    borderBottom: i < rows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                    borderLeft: `3px solid ${STATUS_CONFIG[a.status]?.color || C.border}`,
                    transition: "background 0.1s",
                    cursor: onEmployeeClick ? "pointer" : "default",
                    animation: "slideInUp 0.2s ease both",
                    animationDelay: `${i * 30}ms`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fff5f5"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div><Badge status={a.status} /></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ color: onEmployeeClick ? C.accent : C.text, fontFamily: C.sans, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.full_name}</span>
                    <span style={{ color: C.textMuted, fontFamily: C.mono, fontSize: 11 }}>{a.employee_number}</span>
                  </div>
                  <span style={{ color: C.textSub, fontFamily: C.sans, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.site_name}</span>
                  <span style={{ color: C.textSub, fontFamily: C.mono, fontSize: 12 }}>{a.expiry_date}</span>
                  <div><DaysPill days={a.days_remaining} /></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Dashboard Overview ────────────────────────────────────
const DashboardTab = ({ onNavigate }) => {
  const { data: stats } = useFetch(`${API}/dashboard/stats`);
  const { data: alertData } = useFetch(`${API}/alerts/expiring?days=90`);
  const { data: sites }     = useFetch(`${API}/sites/`);
  const { data: employers } = useFetch(`${API}/employers/`);
  const [selectedEmp, setSelectedEmp] = useState(null);

  const handleEmployeeClick = async (employeeId) => {
    try {
      const res = await apiFetch(`${API}/employees/${employeeId}`);
      const emp = await res.json();
      if (res.ok) setSelectedEmp(emp);
    } catch {}
  };

  const byType = {
    "Passport": [],
    "Work Permit Fee": [],
    "Insurance": [],
    "Visa Stamp": [],
    "Medical": [],
  };
  (alertData?.alerts || []).forEach(a => {
    if (byType[a.expiry_type]) byType[a.expiry_type].push(a);
  });

  const categorySummary = [
    { key: "Passport",        label: "Passports",       color: "#2563eb", metaKey: "PASSPORTS"       },
    { key: "Work Permit Fee", label: "Work Permit Fee", color: "#f97316", metaKey: "WORK PERMIT FEE" },
    { key: "Insurance",       label: "Insurance",       color: "#ca8a04", metaKey: "INSURANCE"       },
    { key: "Visa Stamp",      label: "Visa Stamp",      color: "#a855f7", metaKey: "VISA STAMP"      },
    { key: "Medical",         label: "Medical",         color: "#0891b2", metaKey: "MEDICAL"         },
  ];

  const totalAlerts = (alertData?.alerts || []).length;

  return (
    <div>
      {/* Stat cards row */}
      <div className="dg-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Employees"   value={stats?.total_employees}       sub={`across ${stats?.total_sites ?? "—"} sites`}       accent="#2563eb" onClick={() => onNavigate("EMPLOYEES")} />
        <StatCard label="Employers"         value={stats?.total_employers}       sub={`${stats?.total_sites ?? "—"} sites total`}         accent="#7c3aed" onClick={() => onNavigate("EMPLOYERS")} />
        <StatCard label="Sites at Capacity" value={stats?.sites_at_capacity}     sub="quota full"                                         accent="#059669" glow onClick={() => onNavigate("EMPLOYERS")} />
        <StatCard label="Warning"           value={stats?.total_alerts_warning}  sub="30–90 day window"                                   accent="#ca8a04" glow onClick={() => onNavigate("ALERTS", { view: "expiring", filter: "Warning",  days: 90 })} />
        <StatCard label="Expiring Soon"     value={stats?.total_alerts_critical} sub="within 30 days"                                     accent="#f97316" glow onClick={() => onNavigate("ALERTS", { view: "expiring", filter: "Critical", days: 90 })} />
        <StatCard label="Expired Docs"      value={stats?.total_alerts_expired}  sub="need immediate action"                              accent="#b91c1c" glow onClick={() => onNavigate("ALERTS", { view: "expiring", filter: "Expired",  days: 90 })} />
        <StatCard label="Missing Documents" value={stats?.total_missing_docs}    sub="employees with incomplete records"                  accent="#0891b2" glow onClick={() => onNavigate("ALERTS", { view: "missing",  filter: "All",     days: 60 })} />
      </div>

      {/* Document health grid */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: C.sans, marginBottom: 12 }}>
          Document Health — 90-Day Window
        </div>
        <div className="dg-doc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {categorySummary.map(({ key, label, color, metaKey }) => {
            const items = byType[key] || [];
            const exp   = items.filter(a => a.status === "Expired").length;
            const crit  = items.filter(a => a.status === "Critical").length;
            const warn  = items.filter(a => a.status === "Warning").length;
            const total = exp + crit + warn;
            const allClear = total === 0;
            const worstColor = exp > 0 ? "#b91c1c" : crit > 0 ? "#f97316" : warn > 0 ? "#ca8a04" : "#16a34a";
            const icon = CATEGORY_META[metaKey]?.icon || "•";
            return (
              <div key={key} style={{
                background: "#fff",
                borderRadius: 16, overflow: "hidden",
                boxShadow: `0 2px 12px ${worstColor}14, 0 1px 4px rgba(0,0,0,0.04)`,
                border: `1px solid ${allClear ? "#e2e8f0" : worstColor + "28"}`,
                display: "flex", flexDirection: "column",
                transition: "transform 0.15s, box-shadow 0.2s",
                cursor: "default",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 28px ${worstColor}22, 0 2px 8px rgba(0,0,0,0.06)`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 2px 12px ${worstColor}14, 0 1px 4px rgba(0,0,0,0.04)`; }}>

                {/* Card header */}
                <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                    background: `${color}15`, border: `1.5px solid ${color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: color, fontFamily: C.sans, fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</div>
                    <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 10, marginTop: 1 }}>
                      {allClear ? "90-day window" : `${total} alert${total !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                  {!allClear && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: worstColor, fontFamily: C.mono, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{total}</div>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: allClear ? "#f1f5f9" : `${worstColor}15`, margin: "0 14px" }} />

                {/* Status body */}
                {allClear ? (
                  <div style={{ padding: "14px 18px 16px", display: "flex", alignItems: "center", gap: 7, color: "#16a34a", fontFamily: C.sans, fontSize: 13, fontWeight: 700 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#f0fdf4", border: "1.5px solid #bbf7d0", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✓</span>
                    All clear
                  </div>
                ) : (
                  <div style={{ padding: "12px 12px 14px", display: "flex", gap: 6 }}>
                    {exp > 0 && (
                      <div style={{ flex: 1, background: "#fff1f2", border: "1px solid #fecaca", borderRadius: 10, padding: "9px 8px", textAlign: "center" }}>
                        <div style={{ color: "#b91c1c", fontFamily: C.mono, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{exp}</div>
                        <div style={{ color: "#b91c1c", fontFamily: C.sans, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", marginTop: 4, opacity: 0.8 }}>EXPIRED</div>
                      </div>
                    )}
                    {crit > 0 && (
                      <div style={{ flex: 1, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "9px 8px", textAlign: "center" }}>
                        <div style={{ color: "#f97316", fontFamily: C.mono, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{crit}</div>
                        <div style={{ color: "#f97316", fontFamily: C.sans, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", marginTop: 4, opacity: 0.8 }}>EXPIRING</div>
                      </div>
                    )}
                    {warn > 0 && (
                      <div style={{ flex: 1, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "9px 8px", textAlign: "center" }}>
                        <div style={{ color: "#ca8a04", fontFamily: C.mono, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{warn}</div>
                        <div style={{ color: "#ca8a04", fontFamily: C.sans, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", marginTop: 4, opacity: 0.8 }}>WARNING</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer severity bar */}
                <div style={{ height: 5, display: "flex", marginTop: "auto" }}>
                  {allClear
                    ? <div style={{ flex: 1, background: "linear-gradient(90deg, #16a34a, #22c55e)" }} />
                    : <>
                        {exp  > 0 && <div style={{ flex: exp,  background: "#b91c1c" }} />}
                        {crit > 0 && <div style={{ flex: crit, background: "#f97316" }} />}
                        {warn > 0 && <div style={{ flex: warn, background: "#ca8a04" }} />}
                      </>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category sections */}
      {totalAlerts === 0 ? (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "40px 24px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ color: "#16a34a", fontFamily: C.sans, fontSize: 15, fontWeight: 700 }}>All documents are in order</div>
          <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, marginTop: 6 }}>No alerts in the next 90 days</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <CategorySection title="PASSPORTS"       alerts={byType["Passport"]}        onEmployeeClick={handleEmployeeClick} />
          <CategorySection title="WORK PERMIT FEE" alerts={byType["Work Permit Fee"]} onEmployeeClick={handleEmployeeClick} />
          <CategorySection title="INSURANCE"       alerts={byType["Insurance"]}       onEmployeeClick={handleEmployeeClick} />
          <CategorySection title="VISA STAMP"      alerts={byType["Visa Stamp"]}      onEmployeeClick={handleEmployeeClick} />
          <CategorySection title="MEDICAL"         alerts={byType["Medical"]}         onEmployeeClick={handleEmployeeClick} />
        </div>
      )}

      {selectedEmp && (
        <EmployeeDetailModal
          emp={selectedEmp}
          sites={sites}
          employers={employers}
          onClose={() => setSelectedEmp(null)}
          onUpdated={updated => setSelectedEmp(updated)}
          onDeleted={() => setSelectedEmp(null)}
        />
      )}
    </div>
  );
};

// ── Alerts Tab ────────────────────────────────────────────
const AlertsTab = ({ initialView = "expiring", initialFilter = "All", initialDays = 60 }) => {
  const [view, setView] = useState(initialView);   // "expiring" | "missing"
  const [days, setDays] = useState(initialDays);
  const [filter, setFilter] = useState(initialFilter);
  const [employerFilter, setEmployerFilter] = useState("All");
  const { data: employers } = useFetch(`${API}/employers/`);
  const [selectedEmp, setSelectedEmp] = useState(null);

  const selectedEmployer = employerFilter === "All" ? null : (employers || []).find(e => e.name === employerFilter);

  const alertsUrl = selectedEmployer
    ? `${API}/alerts/expiring?days=${days}&employer_id=${selectedEmployer.id}`
    : `${API}/alerts/expiring?days=${days}`;
  const missingUrl = selectedEmployer
    ? `${API}/alerts/missing?employer_id=${selectedEmployer.id}`
    : `${API}/alerts/missing`;

  const { data: expiringData, loading: expiringLoading } = useFetch(alertsUrl);
  const { data: missingData, loading: missingLoading }   = useFetch(missingUrl);

  const loading = view === "expiring" ? expiringLoading : missingLoading;

  const handleRowClick = async (employeeId) => {
    try {
      const res = await apiFetch(`${API}/employees/${employeeId}`);
      const emp = await res.json();
      if (res.ok) setSelectedEmp(emp);
    } catch {}
  };

  const employerNames = (employers || []).map(e => e.name).sort();

  // ── Expiring view ─────────────────────────────────────
  const STATUS_PRIORITY = { Expired: 4, Critical: 3, Warning: 2, Valid: 1 };
  const DOC_COLS = ["Passport", "Visa Stamp", "Insurance", "Work Permit Fee", "Medical"];

  const allAlerts = (expiringData?.alerts || []);
  const groupMap = {};
  allAlerts.forEach(a => {
    if (!groupMap[a.employee_id]) {
      groupMap[a.employee_id] = {
        employee_id: a.employee_id, employee_number: a.employee_number,
        full_name: a.full_name, employer_name: a.employer_name,
        site_name: a.site_name, docs: {}, worstPriority: 0, worstStatus: "Valid",
      };
    }
    groupMap[a.employee_id].docs[a.expiry_type] = { expiry_date: a.expiry_date, days_remaining: a.days_remaining, status: a.status };
    const p = STATUS_PRIORITY[a.status] || 0;
    if (p > groupMap[a.employee_id].worstPriority) {
      groupMap[a.employee_id].worstPriority = p;
      groupMap[a.employee_id].worstStatus = a.status;
    }
  });

  const groupedRows = Object.values(groupMap)
    .filter(r => filter === "All" || STATUS_PRIORITY[r.worstStatus] >= STATUS_PRIORITY[filter])
    .sort((a, b) => b.worstPriority - a.worstPriority);

  const DocCell = ({ doc }) => {
    if (!doc) return <td style={{ padding: "12px 14px", textAlign: "center", borderRight: `1px solid ${C.borderLight}` }}><span style={{ color: C.textMuted, fontSize: 13 }}>—</span></td>;
    const daysText = doc.days_remaining >= 0 ? `${doc.days_remaining}d left` : `${Math.abs(doc.days_remaining)}d ago`;
    return (
      <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.borderLight}`, verticalAlign: "middle" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Badge status={doc.status} />
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textSub }}>{doc.expiry_date}</span>
          <span style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 700, color: daysColor(doc.days_remaining) }}>{daysText}</span>
        </div>
      </td>
    );
  };

  // ── Missing docs view ─────────────────────────────────
  const missingRows = missingData?.alerts || [];
  const missingTotal = missingData?.total || 0;

  const DOC_FIELD_COLORS = {
    "Passport":        { bg: "#eff6ff", color: "#1d4ed8" },
    "Visa Stamp":      { bg: "#f5f3ff", color: "#6d28d9" },
    "Insurance":       { bg: "#fff7ed", color: "#c2410c" },
    "Work Permit Fee": { bg: "#fefce8", color: "#a16207" },
    "Medical":         { bg: "#ecfeff", color: "#0e7490" },
  };

  const selectStyle = {
    fontFamily: C.sans, fontSize: 13, color: C.text,
    background: C.cardBg, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "7px 32px 7px 12px",
    cursor: "pointer", outline: "none",
    appearance: "none", WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
    minWidth: 200, maxWidth: 320,
  };

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, width: "fit-content", overflow: "hidden" }}>
        {[
          { key: "expiring", label: "⚠ Expiring Documents", count: expiringData ? Object.keys(groupMap).length : null },
          { key: "missing",  label: "○ Missing Documents",  count: missingTotal || null },
        ].map(({ key, label, count }) => (
          <button key={key} onClick={() => setView(key)} style={{
            background: view === key ? C.accent : "transparent",
            color: view === key ? "#fff" : C.textSub,
            border: "none", padding: "9px 20px",
            fontFamily: C.sans, fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          }}>
            {label}
            {count != null && count > 0 && (
              <span style={{ background: view === key ? "rgba(255,255,255,0.25)" : "#fee2e2", color: view === key ? "#fff" : "#dc2626", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Employer filter (shared) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: C.textMuted, fontSize: 12, fontFamily: C.sans, fontWeight: 500, whiteSpace: "nowrap" }}>Employer:</span>
        <select value={employerFilter} onChange={e => setEmployerFilter(e.target.value)} style={selectStyle}>
          <option value="All">All Employers</option>
          {employerNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        {view === "expiring" && (
          <>
            <div style={{ marginLeft: 16, color: C.textMuted, fontSize: 12, fontFamily: C.sans, fontWeight: 500 }}>Look-ahead:</div>
            {[30, 60, 90, 180].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{
                background: days === d ? C.accent : C.cardBg,
                color: days === d ? "#fff" : C.textSub,
                border: `1px solid ${days === d ? C.accent : C.border}`,
                padding: "6px 16px", borderRadius: 8,
                cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600,
              }}>{d}d</button>
            ))}
            <div style={{ flex: 1 }} />
            {[
              { value: "All",      label: "All" },
              { value: "Expired",  label: "Expired" },
              { value: "Critical", label: "Expiring" },
              { value: "Warning",  label: "Warning" },
            ].map(({ value, label }) => (
              <button key={value} onClick={() => setFilter(value)} style={{
                background: filter === value ? (STATUS_CONFIG[value]?.color || C.accent) : C.cardBg,
                color: filter === value ? "#fff" : C.textSub,
                border: `1px solid ${filter === value ? (STATUS_CONFIG[value]?.color || C.accent) : C.border}`,
                padding: "6px 16px", borderRadius: 8,
                cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600,
              }}>{label}</button>
            ))}
          </>
        )}
      </div>

      {loading ? (
        <div style={{ color: C.textMuted, fontFamily: C.sans, padding: 48, textAlign: "center" }}>Loading...</div>
      ) : view === "expiring" ? (
        <div>
          <div style={{ color: C.textMuted, fontSize: 12, fontFamily: C.sans, marginBottom: 12, fontWeight: 500 }}>
            {groupedRows.length} {groupedRows.length === 1 ? "employee" : "employees"} — click a row to view details
          </div>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "12px 14px", textAlign: "left", textTransform: "uppercase", borderRight: `1px solid ${C.border}` }}>Employee</th>
                  <th style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "12px 14px", textAlign: "left", textTransform: "uppercase", borderRight: `1px solid ${C.border}` }}>Employer / Site</th>
                  {DOC_COLS.map(h => (
                    <th key={h} style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "12px 14px", textAlign: "left", textTransform: "uppercase", borderRight: `1px solid ${C.border}`, minWidth: 140 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map(row => (
                  <tr key={row.employee_id}
                    onClick={() => handleRowClick(row.employee_id)}
                    style={{ borderBottom: `1px solid ${C.borderLight}`, transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#fff5f5"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 14px", borderRight: `1px solid ${C.borderLight}`, verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge status={row.worstStatus} />
                          <span style={{ color: C.accent, fontFamily: C.sans, fontSize: 13, fontWeight: 700 }}>{row.full_name}</span>
                        </div>
                        <span style={{ color: C.textMuted, fontFamily: C.mono, fontSize: 11 }}>{row.employee_number}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", borderRight: `1px solid ${C.borderLight}`, verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ color: C.text, fontFamily: C.sans, fontSize: 13, fontWeight: 500 }}>{row.employer_name}</span>
                        <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12 }}>{row.site_name}</span>
                      </div>
                    </td>
                    {DOC_COLS.map(col => <DocCell key={col} doc={row.docs[col]} />)}
                  </tr>
                ))}
                {groupedRows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: C.textMuted, fontFamily: C.sans, fontSize: 13 }}>No alerts found for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Missing Documents view */
        <div>
          <div style={{ color: C.textMuted, fontSize: 12, fontFamily: C.sans, marginBottom: 12, fontWeight: 500 }}>
            {missingRows.length} {missingRows.length === 1 ? "employee" : "employees"} with incomplete records — click a row to update
          </div>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  {["Employee", "Employer / Site", "Missing Documents", "Count"].map(h => (
                    <th key={h} style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "12px 14px", textAlign: "left", textTransform: "uppercase", borderRight: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {missingRows.map(row => (
                  <tr key={row.employee_id}
                    onClick={() => handleRowClick(row.employee_id)}
                    style={{ borderBottom: `1px solid ${C.borderLight}`, transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f0f9ff"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 14px", borderRight: `1px solid ${C.borderLight}`, verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ color: C.text, fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>{row.full_name}</span>
                        <span style={{ color: C.textMuted, fontFamily: C.mono, fontSize: 11 }}>{row.employee_number}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", borderRight: `1px solid ${C.borderLight}`, verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ color: C.text, fontFamily: C.sans, fontSize: 13, fontWeight: 500 }}>{row.employer_name}</span>
                        <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12 }}>{row.site_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.borderLight}`, verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {row.missing_fields.map(field => {
                          const c = DOC_FIELD_COLORS[field] || { bg: "#f1f5f9", color: "#64748b" };
                          return (
                            <span key={field} style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}30`, borderRadius: 5, padding: "2px 9px", fontSize: 11, fontWeight: 600, fontFamily: C.sans }}>
                              {field}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", borderRight: `1px solid ${C.borderLight}`, verticalAlign: "middle" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", background: row.missing_fields.length === 5 ? "#fef2f2" : row.missing_fields.length >= 3 ? "#fff7ed" : "#fffbeb", color: row.missing_fields.length === 5 ? "#dc2626" : row.missing_fields.length >= 3 ? "#c2410c" : "#a16207", fontFamily: C.mono, fontSize: 12, fontWeight: 700 }}>
                        {row.missing_fields.length}
                      </span>
                    </td>
                  </tr>
                ))}
                {missingRows.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#16a34a", fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>✓ All employees have complete records</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedEmp && (
        <EmployeeDetailModal
          emp={selectedEmp}
          sites={null}
          employers={employers}
          onClose={() => setSelectedEmp(null)}
          onUpdated={updated => setSelectedEmp(updated)}
          onDeleted={() => setSelectedEmp(null)}
        />
      )}
    </div>
  );
};

// ── Employees Tab ─────────────────────────────────────────
const STATUS_RANK = { Expired: 4, Critical: 3, Warning: 2, Valid: 1 };
function worstStatus(emp) {
  const statuses = [
    emp.passport_status?.status,
    emp.visa_stamp_status?.status,
    emp.insurance_status?.status,
    emp.work_permit_fee_status?.status,
    emp.medical_status?.status,
  ].filter(Boolean);
  if (!statuses.length) return null;
  return statuses.reduce((best, s) => (STATUS_RANK[s] || 0) > (STATUS_RANK[best] || 0) ? s : best);
}

const PAGE_SIZE = 50;

const EmployeesTab = () => {
  const { data: employees, loading } = useFetch(`${API}/employees/?limit=500`);
  const { data: sites }     = useFetch(`${API}/sites/`);
  const { data: employers } = useFetch(`${API}/employers/`);
  const [showAddForm, setShowAddForm]     = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [selectedEmp, setSelectedEmp]     = useState(null);
  const [localEmployees, setLocalEmployees] = useState(null);
  const [form, setForm]   = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [search, setSearch] = useState("");
  const [showResigned, setShowResigned] = useState(false);
  const [formQuotaSlots, setFormQuotaSlots] = useState([]);
  // filters
  const [filterEmployer, setFilterEmployer] = useState("");
  const [filterSite, setFilterSite]         = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  // sort
  const [sortKey, setSortKey]   = useState("full_name");
  const [sortDir, setSortDir]   = useState("asc");
  // pagination
  const [page, setPage] = useState(1);

  useEffect(() => { if (employees) setLocalEmployees(employees); }, [employees]);
  // reset page on any filter change
  useEffect(() => { setPage(1); }, [search, filterEmployer, filterSite, filterStatus, showResigned]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleFormChange = e => {
    const { name, value } = e.target;
    if (name === "employer_id") {
      setForm(f => ({ ...f, employer_id: value, site_id: "", quota_slot_id: "" }));
      setFormQuotaSlots([]);
    } else if (name === "site_id") {
      setForm(f => ({ ...f, site_id: value, quota_slot_id: "" }));
      if (value) {
        apiFetch(`${API}/quota-slots/?site_id=${value}`)
          .then(r => r.json())
          .then(d => setFormQuotaSlots(Array.isArray(d) ? d : []))
          .catch(() => setFormQuotaSlots([]));
      } else {
        setFormQuotaSlots([]);
      }
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handleAdd = async () => {
    setError(null);
    try {
      const body = { ...form, employer_id: parseInt(form.employer_id), site_id: parseInt(form.site_id) };
      if (body.quota_slot_id) body.quota_slot_id = parseInt(body.quota_slot_id);
      else delete body.quota_slot_id;
      const res = await apiFetch(`${API}/employees/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail?.message || data.detail || "Error creating employee");
      } else {
        setSuccess(`${data.full_name} added successfully.`);
        setShowAddForm(false); setForm({});
        setLocalEmployees(prev => [...(prev || []), data]);
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (e) { setError(e.message); }
  };

  const handleUpdated = (updated) => {
    setLocalEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
    setSelectedEmp(updated);
  };

  const handleDeleted = (id) => {
    setLocalEmployees(prev => prev.filter(e => e.id !== id));
    setSelectedEmp(null);
  };

  const filteredSiteOptions = (sites || [])
    .filter(s => !form.employer_id || s.employer_id === parseInt(form.employer_id))
    .map(s => ({ value: s.id, label: `${s.site_name} (${s.used_slots}/${s.total_quota_slots} slots)` }));

  const employerOptions = (employers || []).map(e => ({ value: e.id, label: e.name }));

  // Sites available for the selected employer filter
  const siteOptions = (sites || [])
    .filter(s => !filterEmployer || s.employer_id === parseInt(filterEmployer));

  const lowerSearch = search.toLowerCase().trim();
  const allFiltered = (localEmployees || []).filter(emp => {
    if (!showResigned && emp.resigned) return false;
    if (filterEmployer && emp.employer_id !== parseInt(filterEmployer)) return false;
    if (filterSite     && emp.site_id     !== parseInt(filterSite))     return false;
    if (filterStatus) {
      const ws = worstStatus(emp);
      if (ws !== filterStatus) return false;
    }
    if (!lowerSearch) return true;
    const empName  = (employers || []).find(e => e.id === emp.employer_id)?.name || "";
    const siteName = (sites     || []).find(s => s.id === emp.site_id)?.site_name || "";
    return (
      emp.full_name?.toLowerCase().includes(lowerSearch) ||
      emp.employee_number?.toLowerCase().includes(lowerSearch) ||
      emp.passport_number?.toLowerCase().includes(lowerSearch) ||
      emp.work_permit_number?.toLowerCase().includes(lowerSearch) ||
      empName.toLowerCase().includes(lowerSearch) ||
      siteName.toLowerCase().includes(lowerSearch) ||
      emp.nationality?.toLowerCase().includes(lowerSearch) ||
      emp.job_title?.toLowerCase().includes(lowerSearch)
    );
  });

  // Sort
  const sorted = [...allFiltered].sort((a, b) => {
    let av, bv;
    if (sortKey === "full_name")    { av = a.full_name || ""; bv = b.full_name || ""; }
    else if (sortKey === "employer") { av = (employers||[]).find(e=>e.id===a.employer_id)?.name||""; bv = (employers||[]).find(e=>e.id===b.employer_id)?.name||""; }
    else if (sortKey === "site")     { av = (sites||[]).find(s=>s.id===a.site_id)?.site_name||""; bv = (sites||[]).find(s=>s.id===b.site_id)?.site_name||""; }
    else if (sortKey === "nationality") { av = a.nationality||""; bv = b.nationality||""; }
    else if (sortKey === "status")   { av = STATUS_RANK[worstStatus(a)]||0; bv = STATUS_RANK[worstStatus(b)]||0; return sortDir==="asc" ? bv-av : av-bv; }
    else                             { av = a[sortKey]||""; bv = b[sortKey]||""; }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const list = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resignedCount = (localEmployees || []).filter(e => e.resigned).length;

  // Status summary of ALL filtered rows (not just current page)
  const summaryExpired  = allFiltered.filter(e => worstStatus(e) === "Expired").length;
  const summaryCritical = allFiltered.filter(e => worstStatus(e) === "Critical").length;
  const summaryWarning  = allFiltered.filter(e => worstStatus(e) === "Warning").length;
  const summaryValid    = allFiltered.filter(e => worstStatus(e) === "Valid").length;

  const selectStyle = {
    background: C.cardBg, border: `1px solid ${C.border}`, color: C.text,
    padding: "8px 12px", borderRadius: 9, fontFamily: C.sans, fontSize: 13,
    outline: "none", cursor: "pointer", appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
    paddingRight: 30,
  };

  const SortTh = ({ label, sortId, style: extraStyle }) => {
    const active = sortKey === sortId;
    return (
      <th onClick={() => handleSort(sortId)} style={{
        color: active ? C.accent : C.textMuted,
        fontFamily: C.sans, fontSize: 11, fontWeight: 600,
        letterSpacing: "0.04em", padding: "12px 12px",
        textAlign: "left", textTransform: "uppercase",
        cursor: "pointer", userSelect: "none",
        whiteSpace: "nowrap",
        ...extraStyle,
      }}>
        {label}
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </th>
    );
  };

  const hasActiveFilter = filterEmployer || filterSite || filterStatus || search;

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="dg-emp-toolbar" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search name, emp no., passport, WP no., employer, site, job title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="dg-search-input"
          style={{
            flex: 1, minWidth: 220, maxWidth: 400, background: C.cardBg, border: `1px solid ${C.border}`,
            color: C.text, padding: "9px 14px", borderRadius: 10,
            fontFamily: C.sans, fontSize: 13, outline: "none",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        />
        <div className="dg-emp-actions" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {success && (
            <div style={{
              position: "fixed", top: 20, right: 20, zIndex: 200,
              background: C.cardBg, border: "1px solid #bbf7d0",
              borderLeft: "4px solid #16a34a", borderRadius: 10,
              padding: "12px 20px", boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
              color: "#15803d", fontFamily: C.sans, fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 8,
              animation: "toastIn 0.3s cubic-bezier(0.22,1,0.36,1)",
              pointerEvents: "none",
            }}>✓ {success}</div>
          )}
          {resignedCount > 0 && (
            <button onClick={() => setShowResigned(v => !v)} style={{
              background: showResigned ? "#f9fafb" : C.cardBg,
              color: showResigned ? "#6b7280" : C.textSub,
              border: `1px solid ${C.border}`,
              padding: "8px 16px", borderRadius: 9, cursor: "pointer",
              fontFamily: C.sans, fontSize: 13, fontWeight: 500,
            }}>
              {showResigned ? "Hide" : "Show"} Resigned ({resignedCount})
            </button>
          )}
          <button onClick={() => setShowCsvImport(true)} style={{
            background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`,
            padding: "9px 18px", borderRadius: 9, cursor: "pointer",
            fontFamily: C.sans, fontSize: 13, fontWeight: 500,
          }}>Import CSV</button>
          <button onClick={() => { setShowAddForm(true); setForm({}); setError(null); }} style={{
            background: C.accent, color: "#fff", border: "none",
            padding: "9px 22px", borderRadius: 9, cursor: "pointer",
            fontFamily: C.sans, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em",
            boxShadow: `0 2px 8px ${C.accent}40`,
          }}>+ Add Employee</button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterEmployer} onChange={e => { setFilterEmployer(e.target.value); setFilterSite(""); }} style={{ ...selectStyle, minWidth: 160 }}>
          <option value="">All Employers</option>
          {(employers || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={filterSite} onChange={e => setFilterSite(e.target.value)} style={{ ...selectStyle, minWidth: 150 }} disabled={siteOptions.length === 0}>
          <option value="">All Sites</option>
          {siteOptions.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle, minWidth: 140 }}>
          <option value="">All Statuses</option>
          <option value="Expired">Expired</option>
          <option value="Critical">Expiring (Critical)</option>
          <option value="Warning">Warning</option>
          <option value="Valid">Valid</option>
        </select>
        {hasActiveFilter && (
          <button onClick={() => { setSearch(""); setFilterEmployer(""); setFilterSite(""); setFilterStatus(""); }} style={{
            background: "none", border: `1px solid ${C.border}`, color: C.textMuted,
            padding: "7px 14px", borderRadius: 9, cursor: "pointer",
            fontFamily: C.sans, fontSize: 12,
          }}>✕ Clear filters</button>
        )}
        <div style={{ flex: 1 }} />
        {/* Status summary pills */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {summaryExpired  > 0 && <span onClick={() => setFilterStatus("Expired")}  style={{ background: "#fff1f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontFamily: C.sans, fontWeight: 700, cursor: "pointer" }}>{summaryExpired} Expired</span>}
          {summaryCritical > 0 && <span onClick={() => setFilterStatus("Critical")} style={{ background: "#fff7ed", color: "#f97316", border: "1px solid #fed7aa", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontFamily: C.sans, fontWeight: 700, cursor: "pointer" }}>{summaryCritical} Expiring</span>}
          {summaryWarning  > 0 && <span onClick={() => setFilterStatus("Warning")}  style={{ background: "#fefce8", color: "#ca8a04", border: "1px solid #fde68a", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontFamily: C.sans, fontWeight: 700, cursor: "pointer" }}>{summaryWarning} Warning</span>}
          {summaryValid    > 0 && <span onClick={() => setFilterStatus("Valid")}    style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontFamily: C.sans, fontWeight: 700, cursor: "pointer" }}>{summaryValid} Valid</span>}
          <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12 }}>{allFiltered.length} employee{allFiltered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {loading && !localEmployees ? (
        <div style={{ color: C.textMuted, fontFamily: C.sans, padding: 48, textAlign: "center" }}>Loading...</div>
      ) : (
        <>
        <div className="dg-table-wrap" style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <SortTh label="Emp No."     sortId="employee_number" />
                <SortTh label="Name"        sortId="full_name" />
                <SortTh label="Job Title"   sortId="job_title" />
                <SortTh label="Passport No." sortId="passport_number" />
                <SortTh label="WP No."      sortId="work_permit_number" />
                <SortTh label="Employer"    sortId="employer" />
                <SortTh label="Site"        sortId="site" />
                <SortTh label="Nationality" sortId="nationality" />
                <SortTh label="Worst Status" sortId="status" />
                <th style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "12px 12px", textAlign: "left", textTransform: "uppercase" }}>Documents</th>
              </tr>
            </thead>
            <tbody>
              {list.map((emp, i) => {
                const ws = worstStatus(emp);
                const wsCfg = STATUS_CONFIG[ws] || {};
                return (
                  <tr key={emp.id}
                    onClick={() => setSelectedEmp(emp)}
                    style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", transition: "background 0.1s", opacity: emp.resigned ? 0.55 : 1, animation: "slideInUp 0.15s ease both", animationDelay: `${i * 15}ms` }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "11px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 12, whiteSpace: "nowrap" }}>{emp.employee_number}</td>
                    <td style={{ padding: "11px 12px", fontFamily: C.sans, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                      <span style={{ color: emp.resigned ? C.textMuted : C.accent }}>{emp.full_name}</span>
                      {emp.resigned && <span style={{ marginLeft: 8, background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", padding: "1px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: C.sans }}>RESIGNED</span>}
                    </td>
                    <td style={{ padding: "11px 12px", color: C.textSub, fontFamily: C.sans, fontSize: 12 }}>{emp.job_title || <span style={{ color: C.textMuted }}>—</span>}</td>
                    <td style={{ padding: "11px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 12 }}>{emp.passport_number || <span style={{ color: C.textMuted }}>—</span>}</td>
                    <td style={{ padding: "11px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 12 }}>{emp.work_permit_number || <span style={{ color: C.textMuted }}>—</span>}</td>
                    <td style={{ padding: "11px 12px", color: C.textSub, fontFamily: C.sans, fontSize: 12, whiteSpace: "nowrap" }}>
                      {(employers || []).find(e => e.id === emp.employer_id)?.name || emp.employer_id}
                    </td>
                    <td style={{ padding: "11px 12px", color: C.textSub, fontFamily: C.sans, fontSize: 12, whiteSpace: "nowrap" }}>
                      {(sites || []).find(s => s.id === emp.site_id)?.site_name || emp.site_id}
                    </td>
                    <td style={{ padding: "11px 12px", color: C.textSub, fontFamily: C.sans, fontSize: 12 }}>{emp.nationality || "—"}</td>
                    <td style={{ padding: "11px 12px" }}>
                      {ws ? (
                        <span style={{
                          background: wsCfg.bg, color: wsCfg.color,
                          border: `1px solid ${wsCfg.color}30`,
                          padding: "3px 10px", borderRadius: 20, fontSize: 11,
                          fontFamily: C.sans, fontWeight: 700,
                        }}>{wsCfg.icon} {wsCfg.label}</span>
                      ) : <span style={{ color: C.textMuted, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {[
                          { key: "passport_status",        short: "PP" },
                          { key: "visa_stamp_status",      short: "VS" },
                          { key: "insurance_status",       short: "IN" },
                          { key: "work_permit_fee_status", short: "WP" },
                          { key: "medical_status",         short: "MD" },
                        ].map(({ key, short }) => {
                          const st = emp[key]?.status;
                          const cfg = STATUS_CONFIG[st];
                          return (
                            <span key={key} title={`${short}: ${st || "missing"}`} style={{
                              background: cfg ? cfg.bg : "#f3f4f6",
                              color: cfg ? cfg.color : C.textMuted,
                              border: `1px solid ${cfg ? cfg.color + "40" : C.border}`,
                              padding: "2px 6px", borderRadius: 6,
                              fontSize: 10, fontFamily: C.mono, fontWeight: 700,
                            }}>{short}</span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && (
            <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, padding: 40, textAlign: "center" }}>
              {hasActiveFilter ? "No employees match your filters." : "No employees found."}
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={{
              background: C.cardBg, border: `1px solid ${C.border}`, color: page===1 ? C.textMuted : C.text,
              padding: "7px 14px", borderRadius: 8, cursor: page===1 ? "default" : "pointer",
              fontFamily: C.sans, fontSize: 13,
            }}>←</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2).reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx-1] > 1) acc.push("…");
              acc.push(p);
              return acc;
            }, []).map((p, i) => p === "…" ? (
              <span key={`ellipsis-${i}`} style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, padding: "0 4px" }}>…</span>
            ) : (
              <button key={p} onClick={() => setPage(p)} style={{
                background: p === page ? C.accent : C.cardBg,
                border: `1px solid ${p === page ? C.accent : C.border}`,
                color: p === page ? "#fff" : C.text,
                padding: "7px 13px", borderRadius: 8, cursor: "pointer",
                fontFamily: C.sans, fontSize: 13, fontWeight: p === page ? 700 : 400,
                minWidth: 36,
              }}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={{
              background: C.cardBg, border: `1px solid ${C.border}`, color: page===totalPages ? C.textMuted : C.text,
              padding: "7px 14px", borderRadius: 8, cursor: page===totalPages ? "default" : "pointer",
              fontFamily: C.sans, fontSize: 13,
            }}>→</button>
            <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12, marginLeft: 6 }}>
              Page {page} of {totalPages} · {allFiltered.length} total
            </span>
          </div>
        )}
        </>
      )}

      {selectedEmp && (
        <EmployeeDetailModal
          emp={selectedEmp}
          sites={sites}
          employers={employers}
          onClose={() => setSelectedEmp(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}

      {showAddForm && (
        <Modal wide title="Add New Employee" onClose={() => { setShowAddForm(false); setError(null); }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          <div className="dg-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <InputRow label="Full Name" name="full_name" value={form.full_name || ""} onChange={handleFormChange} required />
            <InputRow label="Passport No." name="passport_number" value={form.passport_number || ""} onChange={handleFormChange} placeholder="e.g. A12345678" />
            <InputRow label="Work Permit No." name="work_permit_number" value={form.work_permit_number || ""} onChange={handleFormChange} placeholder="e.g. WP-2024-00123" />
            <SelectRow label="Employer" name="employer_id" value={form.employer_id || ""} onChange={handleFormChange} options={employerOptions} required />
            <SelectRow label="Site"     name="site_id"     value={form.site_id || ""}     onChange={handleFormChange} options={filteredSiteOptions} required />
            {form.site_id && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Quota Slot <span style={{ color: C.textMuted, textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
                <select name="quota_slot_id" value={form.quota_slot_id || ""} onChange={handleFormChange}
                  style={{ ...inputStyle(false), appearance: "none", cursor: "pointer" }}>
                  <option value="">— None —</option>
                  {formQuotaSlots.map(s => (
                    <option key={s.id} value={s.id} disabled={!!s.assigned_employee_id}>
                      {s.slot_number}{s.expiry_date ? ` (exp: ${s.expiry_date})` : ""}{s.is_expired ? " ⚠ EXPIRED" : ""}{s.assigned_employee_id ? " — assigned" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Nationality</label>
              <select name="nationality" value={form.nationality || ""} onChange={handleFormChange}
                style={{ ...inputStyle(false), appearance: "none", cursor: "pointer" }}>
                <option value="">— Select —</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <InputRow label="Job Title" name="job_title" value={form.job_title || ""} onChange={handleFormChange} />
            <InputRow label="Passport Expiry" name="passport_expiry" type="date" value={form.passport_expiry || ""} onChange={handleFormChange} />
            <ExtendField label="Visa Stamp Expiry"  name="visa_stamp_expiry"  value={form.visa_stamp_expiry || ""}  onChange={handleFormChange} unit="years" />
            <ExtendField label="Insurance Expiry"   name="insurance_expiry"   value={form.insurance_expiry || ""}   onChange={handleFormChange} unit="years" />
            <ExtendField label="Work Permit Fee Expiry" name="work_permit_fee_expiry" value={form.work_permit_fee_expiry || ""} onChange={handleFormChange} unit="months" />
            <ExtendField label="Medical Expiry"     name="medical_expiry"     value={form.medical_expiry || ""}     onChange={handleFormChange} unit="years" />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowAddForm(false); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>Cancel</button>
            <button onClick={handleAdd} style={{ background: C.accent, color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600, boxShadow: `0 2px 8px ${C.accent}40` }}>Create</button>
          </div>
        </Modal>
      )}

      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onDone={() => { setShowCsvImport(false); setLocalEmployees(null); }}
        />
      )}
    </div>
  );
};

// ── Employers Tab ─────────────────────────────────────────
const EmployersTab = () => {
  const { data: employers, loading, refetch: refetchEmployers } = useFetch(`${API}/employers/`);
  const { data: sites, refetch: refetchSites } = useFetch(`${API}/sites/`);
  const [showEmployerForm, setShowEmployerForm] = useState(false);
  const [showSiteForm, setShowSiteForm] = useState(null);
  const [form, setForm]   = useState({});
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  // Site employees modal
  const [viewSite, setViewSite] = useState(null);          // site object
  const [siteEmployees, setSiteEmployees] = useState([]);   // employees for that site
  const [siteEmpLoading, setSiteEmpLoading] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);

  const [togglingId, setTogglingId] = useState(null);
  const [toggleError, setToggleError] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState({});
  const toggleCollapse = (id) => setCollapsedIds(s => ({ ...s, [id]: !s[id] }));

  const handleToggleEmployer = async (employerId) => {
    setTogglingId(employerId);
    setToggleError(null);
    try {
      const res = await apiFetch(`${API}/employers/${employerId}/toggle`, { method: "PATCH" });
      if (res.ok) {
        refetchEmployers();
      } else {
        const d = await res.json().catch(() => ({}));
        setToggleError(d.detail || `Error ${res.status}`);
      }
    } catch (e) {
      setToggleError(e.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleViewSiteEmployees = async (site) => {
    setViewSite(site);
    setSiteEmpLoading(true);
    try {
      const res = await apiFetch(`${API}/employees/?site_id=${site.id}&limit=200`);
      const data = await res.json();
      setSiteEmployees(Array.isArray(data) ? data : []);
    } catch { setSiteEmployees([]); }
    finally { setSiteEmpLoading(false); }
  };

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleAddEmployer = async () => {
    setError(null);
    const res = await apiFetch(`${API}/employers/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setShowEmployerForm(false); setForm({}); refetchEmployers(); }
    else { const d = await res.json(); setError(d.detail || "Error creating employer"); }
  };

  const handleAddSite = async () => {
    setError(null);
    const res = await apiFetch(`${API}/sites/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, employer_id: parseInt(showSiteForm), total_quota_slots: parseInt(form.total_quota_slots) }),
    });
    if (res.ok) { setShowSiteForm(null); setForm({}); refetchSites(); }
    else { const d = await res.json(); setError(d.detail || "Error creating site"); }
  };

  const sitesByEmployer = {};
  (sites || []).forEach(s => {
    if (!sitesByEmployer[s.employer_id]) sitesByEmployer[s.employer_id] = [];
    sitesByEmployer[s.employer_id].push(s);
  });

  const filteredEmployers = (employers || []).filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.registration_number || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {toggleError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 16 }}>
          ⚠ {toggleError}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            placeholder="Search employers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              fontFamily: C.sans, fontSize: 13, color: C.text,
              background: C.cardBg, border: `1px solid ${C.border}`,
              borderRadius: 9, padding: "8px 12px 8px 34px", outline: "none",
            }}
          />
        </div>
        <button onClick={() => { setShowEmployerForm(true); setForm({}); setError(null); }} style={{
          background: C.accent, color: "#fff", border: "none",
          padding: "9px 22px", borderRadius: 9, cursor: "pointer",
          fontFamily: C.sans, fontSize: 13, fontWeight: 600,
          boxShadow: `0 2px 8px ${C.accent}40`, flexShrink: 0,
        }}>+ Add Employer</button>
      </div>

      {loading ? (
        <div style={{ color: C.textMuted, fontFamily: C.sans, padding: 48, textAlign: "center" }}>Loading...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filteredEmployers.length === 0 && search && (
            <div style={{ color: C.textMuted, fontFamily: C.sans, padding: 48, textAlign: "center" }}>
              No employers match "{search}"
            </div>
          )}
          {filteredEmployers.map(employer => {
            const empSites   = sitesByEmployer[employer.id] || [];
            const totalSlots = empSites.reduce((s, x) => s + (x.total_quota_slots || 0), 0);
            const usedSlots  = empSites.reduce((s, x) => s + (x.used_slots || 0), 0);
            const isDisabled = employer.is_active === false;
            const isCollapsed = !!collapsedIds[employer.id];
            return (
              <div key={employer.id} style={{
                background: C.cardBg,
                border: `1px solid ${isDisabled ? "#fca5a5" : C.border}`,
                borderRadius: 14, overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                opacity: isDisabled ? 0.7 : 1,
                transition: "opacity 0.2s, border-color 0.2s",
              }}>
                {/* Employer header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", background: isDisabled ? "#fef2f2" : C.pageBg, borderBottom: empSites.length > 0 && !isCollapsed ? `1px solid ${C.border}` : "none" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: isDisabled ? "#fee2e2" : C.accentBg,
                    border: `1px solid ${isDisabled ? "#fca5a5" : C.accentBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: isDisabled ? "#ef4444" : C.accent, fontSize: 14, fontWeight: 800, fontFamily: C.sans,
                    flexShrink: 0,
                  }}>
                    {employer.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: isDisabled ? C.textMuted : C.text, fontFamily: C.sans, fontSize: 15, fontWeight: 700, textDecoration: isDisabled ? "line-through" : "none" }}>{employer.name}</span>
                      {isDisabled && (
                        <span style={{ background: "#fee2e2", color: "#ef4444", fontFamily: C.sans, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Disabled</span>
                      )}
                    </div>
                    {employer.registration_number && (
                      <div style={{ color: C.textMuted, fontFamily: C.mono, fontSize: 11, marginTop: 2 }}>Reg: {employer.registration_number}</div>
                    )}
                  </div>
                  <span style={{ color: C.textSub, fontFamily: C.sans, fontSize: 12, fontWeight: 500, background: C.border, padding: "3px 10px", borderRadius: 20 }}>
                    {empSites.length} {empSites.length === 1 ? "site" : "sites"}
                  </span>
                  {totalSlots > 0 && (
                    <span style={{ color: C.textSub, fontFamily: C.mono, fontSize: 12 }}>{usedSlots}/{totalSlots} slots</span>
                  )}
                  {!isDisabled && (
                    <button onClick={() => { setShowSiteForm(employer.id); setForm({}); setError(null); }} style={{
                      background: "transparent", color: C.accent, border: `1px solid ${C.accentBorder}`,
                      padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                      fontFamily: C.sans, fontSize: 12, fontWeight: 600,
                    }}>+ Add Site</button>
                  )}
                  {empSites.length > 0 && (
                    <button onClick={() => toggleCollapse(employer.id)} style={{
                      background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`,
                      padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                      fontFamily: C.sans, fontSize: 12, display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ display: "inline-block", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
                      {isCollapsed ? "Show" : "Hide"}
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleEmployer(employer.id)}
                    disabled={togglingId === employer.id}
                    style={{
                      background: isDisabled ? "#f0fdf4" : "#fff7ed",
                      color: isDisabled ? "#16a34a" : "#d97706",
                      border: `1px solid ${isDisabled ? "#bbf7d0" : "#fed7aa"}`,
                      padding: "6px 14px", borderRadius: 8,
                      cursor: togglingId === employer.id ? "not-allowed" : "pointer",
                      fontFamily: C.sans, fontSize: 12, fontWeight: 600,
                      opacity: togglingId === employer.id ? 0.6 : 1,
                    }}
                  >
                    {togglingId === employer.id ? "..." : isDisabled ? "Enable" : "Disable"}
                  </button>
                </div>
                {empSites.length > 0 && !isCollapsed && (
                  <div style={{ padding: "14px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                    {empSites.map(site => <SiteCard key={site.id} site={site} onViewEmployees={handleViewSiteEmployees} onSiteUpdated={() => refetchSites()} />)}
                  </div>
                )}
                {empSites.length === 0 && (
                  <div style={{ padding: "16px 22px", color: C.textMuted, fontFamily: C.sans, fontSize: 13 }}>
                    No sites yet — click + Add Site to create one.
                  </div>
                )}
              </div>
            );
          })}
          {(employers || []).length === 0 && (
            <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 14, textAlign: "center", padding: 56 }}>
              No employers found. Click + Add Employer to get started.
            </div>
          )}
        </div>
      )}

      {showEmployerForm && (
        <Modal title="Add New Employer" onClose={() => { setShowEmployerForm(false); setError(null); }}>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 16 }}>⚠ {error}</div>}
          <InputRow label="Employer Name"       name="name"                value={form.name || ""}                onChange={handleChange} required />
          <InputRow label="Registration Number" name="registration_number" value={form.registration_number || ""} onChange={handleChange} required />
          <InputRow label="Contact Name"        name="contact_name"        value={form.contact_name || ""}        onChange={handleChange} />
          <InputRow label="Contact Email"       name="contact_email"       value={form.contact_email || ""}       onChange={handleChange} />
          <InputRow label="Contact Phone"       name="contact_phone"       value={form.contact_phone || ""}       onChange={handleChange} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowEmployerForm(false); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>Cancel</button>
            <button onClick={handleAddEmployer} style={{ background: C.accent, color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600, boxShadow: `0 2px 8px ${C.accent}40` }}>Create</button>
          </div>
        </Modal>
      )}

      {showSiteForm && (
        <Modal title="Add New Site" onClose={() => { setShowSiteForm(null); setError(null); }}>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 16 }}>⚠ {error}</div>}
          <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, color: C.textSub, marginBottom: 20 }}>
            Employer: <strong style={{ color: C.text }}>{(employers || []).find(e => e.id === showSiteForm)?.name}</strong>
          </div>
          <InputRow label="Site Name"         name="site_name"         value={form.site_name || ""}         onChange={handleChange} required />
          <InputRow label="Total Quota Slots" name="total_quota_slots" type="number" value={form.total_quota_slots || ""} onChange={handleChange} required />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowSiteForm(null); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>Cancel</button>
            <button onClick={handleAddSite} style={{ background: C.accent, color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600, boxShadow: `0 2px 8px ${C.accent}40` }}>Create</button>
          </div>
        </Modal>
      )}

      {/* Site employees modal */}
      {viewSite && (
        <Modal wide title={`${viewSite.site_name} — Assigned Employees`} onClose={() => setViewSite(null)}>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total Slots",      value: viewSite.total_quota_slots, color: C.textSub },
              { label: "Occupied",         value: viewSite.used_slots,        color: C.accent },
              { label: "Available",        value: viewSite.available_slots,   color: "#16a34a" },
              { label: "Utilisation",      value: `${viewSite.quota_utilisation_pct}%`, color: C.textSub },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: C.sans, marginBottom: 4 }}>{label}</div>
                <div style={{ color, fontSize: 22, fontWeight: 800, fontFamily: C.mono }}>{value}</div>
              </div>
            ))}
          </div>
          {siteEmpLoading ? (
            <div style={{ color: C.textMuted, fontFamily: C.sans, padding: 32, textAlign: "center" }}>Loading...</div>
          ) : siteEmployees.length === 0 ? (
            <div style={{ color: C.textMuted, fontFamily: C.sans, padding: 32, textAlign: "center" }}>No employees assigned to this site.</div>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                    {["Emp No.", "Name", "Nationality", "Job Title", "Passport", "Visa", "Insurance", "Work Permit", "Medical"].map(h => (
                      <th key={h} style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", padding: "10px 12px", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {siteEmployees.map(emp => (
                    <tr key={emp.id}
                      onClick={() => setSelectedEmp(emp)}
                      style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", transition: "background 0.1s", opacity: emp.resigned ? 0.5 : 1 }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fff5f5"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "9px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{emp.employee_number}</td>
                      <td style={{ padding: "9px 12px", color: C.accent, fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>
                        {emp.full_name}
                        {emp.resigned && <span style={{ marginLeft: 6, background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>RESIGNED</span>}
                      </td>
                      <td style={{ padding: "9px 12px", color: C.textSub, fontFamily: C.sans, fontSize: 12 }}>{emp.nationality || "—"}</td>
                      <td style={{ padding: "9px 12px", color: C.textSub, fontFamily: C.sans, fontSize: 12 }}>{emp.job_title || "—"}</td>
                      <td style={{ padding: "9px 12px" }}>{emp.passport_status        ? <Badge status={emp.passport_status.status}        /> : <span style={{ color: C.textMuted }}>—</span>}</td>
                      <td style={{ padding: "9px 12px" }}>{emp.visa_stamp_status      ? <Badge status={emp.visa_stamp_status.status}      /> : <span style={{ color: C.textMuted }}>—</span>}</td>
                      <td style={{ padding: "9px 12px" }}>{emp.insurance_status       ? <Badge status={emp.insurance_status.status}       /> : <span style={{ color: C.textMuted }}>—</span>}</td>
                      <td style={{ padding: "9px 12px" }}>{emp.work_permit_fee_status ? <Badge status={emp.work_permit_fee_status.status} /> : <span style={{ color: C.textMuted }}>—</span>}</td>
                      <td style={{ padding: "9px 12px" }}>{emp.medical_status         ? <Badge status={emp.medical_status.status}         /> : <span style={{ color: C.textMuted }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* Employee detail from site employees modal */}
      {selectedEmp && (
        <EmployeeDetailModal
          emp={selectedEmp}
          sites={sites}
          employers={employers}
          onClose={() => setSelectedEmp(null)}
          onUpdated={updated => {
            setSelectedEmp(updated);
            setSiteEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
          }}
          onDeleted={id => {
            setSelectedEmp(null);
            setSiteEmployees(prev => prev.filter(e => e.id !== id));
          }}
        />
      )}
    </div>
  );
};

// ── CSV Import Modal ──────────────────────────────────────
const CSV_UPDATE_TEMPLATE = [
  "employee_number,full_name,passport_number,work_permit_number,nationality,job_title,passport_expiry,visa_stamp_expiry,insurance_expiry,work_permit_fee_expiry,medical_expiry,quota_slot_number,quota_slot_expiry",
  "EMP-100,John Smith,A12345678,WP-2024-00123,British,Engineer,2028-06-15,2026-06-15,2026-12-01,2026-09-01,2026-03-15,QS00301620,2026-09-30",
  "EMP-101,,,,,,,,2026-07-20,2026-10-01,2026-04-20,,",
].join("\n");

const CSV_CREATE_TEMPLATE = [
  "full_name,employer_name,site_name,passport_number,work_permit_number,nationality,job_title,passport_expiry,visa_stamp_expiry,insurance_expiry,work_permit_fee_expiry,medical_expiry,quota_slot_number,quota_slot_expiry",
  "John Smith,Gulf Construction LLC,Dubai Marina Site,A12345678,WP-2024-00123,British,Engineer,2028-06-15,2026-06-15,2026-12-01,2026-09-01,2026-03-15,QS00301620,2026-09-30",
  "Jane Doe,Gulf Construction LLC,Dubai Marina Site,B98765432,WP-2024-00124,Filipino,Technician,2029-03-20,2027-03-20,2027-06-10,2027-03-20,2027-03-20,,",
].join("\n");

const CsvImportModal = ({ onClose, onDone }) => {
  const [mode, setMode] = useState("create"); // "create" | "update"
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const switchMode = (m) => { setMode(m); setFile(null); setResult(null); setError(null); };

  const downloadTemplate = () => {
    const content = mode === "create" ? CSV_CREATE_TEMPLATE : CSV_UPDATE_TEMPLATE;
    const filename = mode === "create" ? "new_employees_template.csv" : "update_employees_template.csv";
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    const endpoint = mode === "create" ? `${API}/employees/bulk-create` : `${API}/employees/bulk-update`;
    try {
      const res = await apiFetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Upload failed"); }
      else { setResult(data); }
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  const CREATE_FIELDS = [
    { col: "full_name",              note: "REQUIRED — employee's full name", required: true },
    { col: "employer_name",          note: "REQUIRED — exact employer name as in the system", required: true },
    { col: "site_name",              note: "REQUIRED — exact site name under that employer", required: true },
    { col: "passport_number",        note: "Passport document number — checked for duplicates" },
    { col: "work_permit_number",     note: "Work permit document number (e.g. WP-2024-00123)" },
    { col: "nationality",            note: "e.g. Indian, Pakistani, Filipino" },
    { col: "job_title",              note: "e.g. Site Supervisor, Electrician" },
    { col: "passport_expiry",        note: "Date format: YYYY-MM-DD" },
    { col: "visa_stamp_expiry",      note: "Date format: YYYY-MM-DD" },
    { col: "insurance_expiry",       note: "Date format: YYYY-MM-DD" },
    { col: "work_permit_fee_expiry", note: "Date format: YYYY-MM-DD" },
    { col: "medical_expiry",         note: "Date format: YYYY-MM-DD — renewed yearly" },
    { col: "quota_slot_number",      note: "e.g. QS00301620 — assigns employee to this slot (must belong to the same site); leave blank for none" },
    { col: "quota_slot_expiry",      note: "YYYY-MM-DD — sets the expiry of the assigned quota slot; only used when quota_slot_number is provided" },
  ];

  const UPDATE_FIELDS = [
    { col: "employee_number",        note: "REQUIRED — existing system ID (e.g. EMP-100). Used to find the employee.", required: true },
    { col: "full_name",              note: "Employee's full name — leave blank to keep current value" },
    { col: "passport_number",        note: "Passport document number — checked for duplicates; leave blank to keep" },
    { col: "work_permit_number",     note: "Work permit document number (e.g. WP-2024-00123); leave blank to keep" },
    { col: "nationality",            note: "e.g. Indian, Pakistani, Filipino — leave blank to keep current" },
    { col: "job_title",              note: "e.g. Site Supervisor, Electrician — leave blank to keep current" },
    { col: "passport_expiry",        note: "YYYY-MM-DD — leave blank to keep current date" },
    { col: "visa_stamp_expiry",      note: "YYYY-MM-DD — leave blank to keep current date" },
    { col: "insurance_expiry",       note: "YYYY-MM-DD — leave blank to keep current date" },
    { col: "work_permit_fee_expiry", note: "YYYY-MM-DD — leave blank to keep current date" },
    { col: "medical_expiry",         note: "YYYY-MM-DD — leave blank to keep current date" },
    { col: "quota_slot_number",      note: "e.g. QS00301620 — assigns employee to this slot (must belong to same site); use null to unassign; leave blank to skip" },
    { col: "quota_slot_expiry",      note: "YYYY-MM-DD — updates the expiry of the employee's assigned quota slot; leave blank to skip" },
  ];

  const fields = mode === "create" ? CREATE_FIELDS : UPDATE_FIELDS;

  return (
    <Modal wide title="CSV Import" onClose={() => result ? onDone() : onClose()}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, background: C.borderLight, padding: 3, borderRadius: 10, width: "fit-content", marginBottom: 20 }}>
        {[
          { key: "create", label: "➕ Add New Employees" },
          { key: "update", label: "✏️ Update Existing" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => switchMode(key)} style={{
            background: mode === key ? C.cardBg : "transparent",
            color: mode === key ? C.text : C.textSub,
            border: "none", padding: "8px 20px", cursor: "pointer",
            borderRadius: 8, fontFamily: C.sans, fontSize: 13,
            fontWeight: mode === key ? 600 : 400,
            boxShadow: mode === key ? "0 1px 6px rgba(0,0,0,0.1)" : "none",
            transition: "all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        {/* How it works */}
        <div style={{ background: mode === "create" ? "#f0fdf4" : "#eff6ff", border: `1px solid ${mode === "create" ? "#bbf7d0" : "#bfdbfe"}`, borderRadius: 9, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ color: mode === "create" ? "#16a34a" : "#1d4ed8", fontFamily: C.sans, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            {mode === "create" ? "Adding new employees" : "Updating existing employees"}
          </div>
          <div style={{ color: mode === "create" ? "#166534" : "#1e40af", fontFamily: C.sans, fontSize: 12, lineHeight: 1.6 }}>
            {mode === "create"
              ? <>Each row creates one <strong>new employee</strong>. Employee numbers are <strong>auto-generated</strong> by the system. Use the exact employer and site names as they appear in the system. Duplicate passport numbers are rejected.</>
              : <>Each row updates one <strong>existing employee</strong>. <strong>employee_number</strong> is the lookup key — copy it from the Employees tab. It does <em>not</em> change the employee's number. Leave any column blank to keep its current value.</>
            }
          </div>
        </div>

        {/* Field reference */}
        <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: C.cardBg }}>
            <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Column Reference</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {fields.map(({ col, note, required }, i) => (
              <div key={col} style={{ display: "flex", gap: 10, padding: "7px 14px", borderBottom: i < fields.length - 1 ? `1px solid ${C.borderLight}` : "none", alignItems: "flex-start", background: required ? "#fefce8" : "transparent" }}>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: required ? "#d97706" : C.accent, whiteSpace: "nowrap", fontWeight: 600, minWidth: 170 }}>{col}{required ? " *" : ""}</span>
                <span style={{ fontFamily: C.sans, fontSize: 11, color: C.textSub, lineHeight: 1.4 }}>{note}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={downloadTemplate} style={{
          background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`,
          padding: "7px 16px", borderRadius: 8, cursor: "pointer",
          fontFamily: C.sans, fontSize: 12, fontWeight: 500,
        }}>
          Download Template CSV
        </button>
      </div>

      <div style={{ background: C.pageBg, border: `2px dashed ${C.border}`, borderRadius: 10, padding: "24px", textAlign: "center", marginBottom: 16 }}>
        <input type="file" accept=".csv" onChange={e => { setFile(e.target.files[0]); setResult(null); }} style={{ display: "none" }} id="csv-upload" />
        <label htmlFor="csv-upload" style={{ cursor: "pointer" }}>
          <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13, marginBottom: 8 }}>
            {file ? `✓ ${file.name}` : "Click to select CSV file"}
          </div>
          <div style={{
            display: "inline-block", background: C.cardBg, border: `1px solid ${C.border}`,
            padding: "7px 18px", borderRadius: 8, color: C.textSub, fontSize: 12, fontFamily: C.sans, fontWeight: 500,
          }}>Browse</div>
        </label>
      </div>

      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {result && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ color: "#16a34a", fontFamily: C.sans, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>✓ Import complete</div>
          {mode === "create" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ color: C.textSub, fontSize: 12, fontFamily: C.sans }}>Created: <strong style={{ color: "#16a34a" }}>{result.created}</strong> employees</div>
              {result.skipped > 0 && <div style={{ color: "#d97706", fontSize: 12, fontFamily: C.sans }}>Skipped: <strong>{result.skipped}</strong> (quota full or duplicate passport)</div>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ color: C.textSub, fontSize: 12, fontFamily: C.sans }}>Updated: <strong style={{ color: "#16a34a" }}>{result.updated}</strong> employees</div>
              {result.not_found?.length > 0 && <div style={{ color: "#d97706", fontSize: 12, fontFamily: C.sans }}>Not found: {result.not_found.join(", ")}</div>}
            </div>
          )}
          {result.errors?.length > 0 && (
            <div style={{ marginTop: 8, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "8px 12px" }}>
              <div style={{ color: "#dc2626", fontFamily: C.sans, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Errors ({result.errors.length})</div>
              {result.errors.map((e, i) => <div key={i} style={{ color: "#dc2626", fontSize: 11, fontFamily: C.mono }}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={() => result ? onDone() : onClose()} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>
          {result ? "Done" : "Cancel"}
        </button>
        {!result && (
          <button onClick={handleUpload} disabled={!file || loading} style={{
            background: C.accent, color: "#fff", border: "none",
            padding: "9px 24px", borderRadius: 8, cursor: (!file || loading) ? "not-allowed" : "pointer",
            fontFamily: C.sans, fontSize: 13, fontWeight: 600, opacity: (!file || loading) ? 0.6 : 1,
          }}>
            {loading ? "Uploading..." : mode === "create" ? "Upload & Create" : "Upload & Update"}
          </button>
        )}
      </div>
    </Modal>
  );
};

// ── Users Management Modal ────────────────────────────────
const UsersModal = ({ onClose, currentUserId }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: "", password: "", is_admin: false });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw, setResetPw] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    const res = await apiFetch(`${API}/auth/users`);
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null); setSaving(true);
    const res = await apiFetch(`${API}/auth/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.detail || "Error creating user"); }
    else { setForm({ username: "", password: "", is_admin: false }); loadUsers(); }
    setSaving(false);
  };

  const handleToggle = async (user, field) => {
    const res = await apiFetch(`${API}/auth/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !user[field] }),
    });
    if (res.ok) loadUsers();
    else { const d = await res.json().catch(() => ({})); setError(d.detail || "Error"); }
  };

  const handleDelete = async (userId) => {
    const res = await apiFetch(`${API}/auth/users/${userId}`, { method: "DELETE" });
    if (res.ok) loadUsers();
    else { const d = await res.json().catch(() => ({})); setError(d.detail || "Error deleting user"); }
  };

  const handleResetPassword = async (userId) => {
    if (!resetPw.trim()) return;
    const res = await apiFetch(`${API}/auth/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPw }),
    });
    if (res.ok) { setResetTarget(null); setResetPw(""); }
    else { const d = await res.json().catch(() => ({})); setError(d.detail || "Error resetting password"); }
  };

  const btnStyle = (active, color) => ({
    background: active ? `${color}15` : C.pageBg,
    color: active ? color : C.textSub,
    border: `1px solid ${active ? color + "40" : C.border}`,
    padding: "3px 10px", borderRadius: 6, cursor: "pointer",
    fontFamily: C.sans, fontSize: 11, fontWeight: 600,
  });

  return (
    <Modal title="User Management" onClose={onClose} wide>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {error} <button onClick={() => setError(null)} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Create user form */}
      <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ color: C.textSub, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Add New User</div>
        <form onSubmit={handleCreate}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Username</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required style={inputStyle(false)} placeholder="username" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Password</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required style={inputStyle(false)} placeholder="••••••••" />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_admin} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span style={{ color: C.textSub, fontSize: 13, fontFamily: C.sans }}>Grant admin access</span>
            </label>
            <button type="submit" disabled={saving} style={{
              background: C.accent, color: "#fff", border: "none",
              padding: "9px 24px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
              fontFamily: C.sans, fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1,
            }}>
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>

      {/* User list */}
      {loading ? (
        <div style={{ color: C.textMuted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map(u => (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              background: C.pageBg, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "12px 16px",
              opacity: u.is_active ? 1 : 0.6,
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ color: C.text, fontFamily: C.mono, fontSize: 13, fontWeight: 600 }}>{u.username}</span>
                {u.id === currentUserId && <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 11, marginLeft: 8 }}>(you)</span>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => handleToggle(u, "is_admin")} style={btnStyle(u.is_admin, "#7c3aed")} title="Toggle admin">
                  {u.is_admin ? "Admin" : "User"}
                </button>
                <button onClick={() => handleToggle(u, "is_active")} style={btnStyle(u.is_active, "#16a34a")} title="Toggle active">
                  {u.is_active ? "Active" : "Inactive"}
                </button>
                {resetTarget === u.id ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                      placeholder="New password" style={{ ...inputStyle(false), width: 130, padding: "5px 8px", fontSize: 12 }} />
                    <button onClick={() => handleResetPassword(u.id)} style={{ ...btnStyle(true, "#2563eb"), padding: "5px 10px" }}>Save</button>
                    <button onClick={() => { setResetTarget(null); setResetPw(""); }} style={{ ...btnStyle(false, C.textSub), padding: "5px 10px" }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setResetTarget(u.id)} style={btnStyle(false, C.textSub)} title="Reset password">
                    Reset PW
                  </button>
                )}
                {u.id !== currentUserId && (
                  <button onClick={() => handleDelete(u.id)} style={{ ...btnStyle(false, "#dc2626"), color: "#dc2626" }} title="Delete user">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

// ── Login Screen ──────────────────────────────────────────
const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Login failed");
      } else {
        saveToken(data.access_token);
        onLogin();
      }
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: C.pageBg, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: C.sans,
    }}>
      <div style={{
        background: C.cardBg, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: "40px 44px", width: 360,
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: `linear-gradient(135deg, ${C.accent}, #b91c1c)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 10px ${C.accent}40`,
          }}>
            <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>W</span>
          </div>
          <div>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>DocGuard</div>
            <div style={{ color: C.textMuted, fontSize: 11 }}>Sign in to continue</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              required autoFocus style={inputStyle(false)}
              placeholder="admin"
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required style={inputStyle(false)}
            />
          </div>
          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626",
              padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={{
            width: "100%", background: C.accent, color: "#fff",
            border: "none", padding: "11px 0", borderRadius: 9,
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1, fontFamily: C.sans,
          }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Reports ────────────────────────────────────────────────
const DOC_STATUS_FIELDS = [
  { key: "passport_status",        expKey: "passport_expiry",        label: "Passport" },
  { key: "visa_stamp_status",      expKey: "visa_stamp_expiry",      label: "Visa Stamp" },
  { key: "insurance_status",       expKey: "insurance_expiry",       label: "Insurance" },
  { key: "work_permit_fee_status", expKey: "work_permit_fee_expiry", label: "WPF" },
  { key: "medical_status",         expKey: "medical_expiry",         label: "Medical" },
];

function calcComplianceScore(employees) {
  let total = 0, valid = 0;
  for (const emp of employees) {
    for (const { key, expKey } of DOC_STATUS_FIELDS) {
      if (emp[expKey]) { total++; if (emp[key]?.status === "Valid") valid++; }
    }
  }
  return total === 0 ? 100 : Math.round(valid / total * 100);
}

function pdfStatusStyle(status) {
  if (status === "Valid")    return { fillColor: [240,253,244], textColor: [22,163,74],   fontStyle: "bold" };
  if (status === "Warning")  return { fillColor: [254,252,232], textColor: [202,138,4],   fontStyle: "bold" };
  if (status === "Critical") return { fillColor: [255,247,237], textColor: [249,115,22],  fontStyle: "bold" };
  if (status === "Expired")  return { fillColor: [254,242,242], textColor: [185,28,28],   fontStyle: "bold" };
  return { fillColor: [248,250,252], textColor: [148,163,184] };
}

function pdfHeader(doc, title, subtitle, landscape) {
  const w = landscape ? 297 : 210;
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(title, 14, 10);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(subtitle, 14, 17);
  doc.setFontSize(9);
  doc.text(`Generated: ${today}`, w - 57, 17);
  return today;
}

function exportCompliancePDF(employees, employerName) {
  // eslint-disable-next-line new-cap
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const today = pdfHeader(doc, "COMPLIANCE REPORT", employerName || "All Employers", true);
  const score = calcComplianceScore(employees);
  const expired  = employees.reduce((n, e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Expired").length, 0);
  const critical = employees.reduce((n, e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Critical").length, 0);
  const warning  = employees.reduce((n, e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Warning").length, 0);

  // Summary bar
  doc.setFillColor(241, 245, 249);
  doc.rect(0, 22, 297, 14, "F");
  const sumItems = [
    { label: "EMPLOYEES",        value: String(employees.length), color: [15,23,42] },
    { label: "COMPLIANCE SCORE", value: `${score}%`,              color: score >= 80 ? [22,163,74] : score >= 60 ? [217,119,6] : [220,38,38] },
    { label: "EXPIRED",          value: String(expired),          color: expired  > 0 ? [185,28,28]   : [22,163,74] },
    { label: "CRITICAL",         value: String(critical),         color: critical > 0 ? [249,115,22]  : [22,163,74] },
    { label: "WARNING",          value: String(warning),          color: warning  > 0 ? [202,138,4]   : [22,163,74] },
  ];
  let sx = 14;
  for (const { label, value, color } of sumItems) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...color);
    doc.text(value, sx, 31);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(label, sx, 34);
    sx += 56;
  }

  // Build rows grouped by site
  const bySite = {};
  for (const emp of employees) {
    const k = emp.site_name; if (!bySite[k]) bySite[k] = []; bySite[k].push(emp);
  }
  const allRows = [];
  const sectionHeaders = [];
  let rowIdx = 0;
  for (const [siteName, emps] of Object.entries(bySite)) {
    sectionHeaders.push({ text: `${employerName ? "" : emps[0]?.employer_name + " — "}${siteName}`, beforeRow: rowIdx });
    for (const [i, emp] of emps.entries()) {
      allRows.push([
        String(i + 1), emp.employee_number, emp.full_name,
        emp.passport_number || "—", emp.nationality || "—", emp.job_title || "—",
        emp.passport_status?.status || "—",
        emp.visa_stamp_status?.status || "—",
        emp.insurance_status?.status || "—",
        emp.work_permit_fee_status?.status || "—",
        emp.medical_status?.status || "—",
      ]);
      rowIdx++;
    }
  }

  autoTable(doc, {
    startY: 40,
    head: [["#", "EMP ID", "Name", "Passport No.", "Nationality", "Job Title", "Passport", "Visa Stamp", "Insurance", "WPF", "Medical"]],
    body: allRows,
    styles: { fontSize: 7.5, cellPadding: 2, font: "helvetica" },
    headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold", fontSize: 8 },
    columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:20}, 2:{cellWidth:36}, 3:{cellWidth:24}, 4:{cellWidth:20}, 5:{cellWidth:22}, 6:{cellWidth:20}, 7:{cellWidth:20}, 8:{cellWidth:20}, 9:{cellWidth:15}, 10:{cellWidth:17} },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index >= 6) {
        const s = pdfStatusStyle(d.cell.raw);
        d.cell.styles.fillColor = s.fillColor; d.cell.styles.textColor = s.textColor; d.cell.styles.fontStyle = s.fontStyle;
      }
    },
    willDrawCell: (d) => {
      if (d.section === "body") {
        const sh = sectionHeaders.find(h => h.beforeRow === d.row.index);
        if (sh && d.column.index === 0) {
          const { doc: pdoc, cell } = d;
          pdoc.setFillColor(226, 232, 240); pdoc.rect(cell.x - 1, cell.y - 6, 282, 7, "F");
          pdoc.setFontSize(8); pdoc.setFont("helvetica", "bold"); pdoc.setTextColor(71, 85, 105);
          pdoc.text(sh.text.toUpperCase(), cell.x + 1, cell.y - 1);
        }
      }
    },
    didDrawPage: (d) => {
      doc.setFontSize(7); doc.setTextColor(148, 163, 184);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, d.settings.margin.left, doc.internal.pageSize.height - 5);
    },
  });
  doc.save(`Compliance_${(employerName || "All").replace(/\s+/g, "_")}_${today.replace(/\s+/g, "-")}.pdf`);
}

function exportExpiryPDF(alerts, employerName) {
  // eslint-disable-next-line new-cap
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const today = pdfHeader(doc, "EXPIRY PIPELINE REPORT", employerName || "All Employers", true);
  autoTable(doc, {
    startY: 28,
    head: [["Employer", "Site", "Emp ID", "Full Name", "Document", "Expiry Date", "Days", "Status"]],
    body: alerts.map(a => [
      a.employer_name, a.site_name, a.employee_number, a.full_name,
      a.expiry_type, a.expiry_date,
      a.days_remaining < 0 ? `${a.days_remaining}d` : `+${a.days_remaining}d`,
      a.status,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold" },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 7) {
        const s = pdfStatusStyle(d.cell.raw); d.cell.styles.fillColor = s.fillColor; d.cell.styles.textColor = s.textColor; d.cell.styles.fontStyle = s.fontStyle;
      }
    },
  });
  doc.save(`ExpiryPipeline_${today.replace(/\s+/g, "-")}.pdf`);
}

function exportQuotaPDF(sites) {
  // eslint-disable-next-line new-cap
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const today = pdfHeader(doc, "SITE QUOTA REPORT", "All Sites", false);
  autoTable(doc, {
    startY: 28,
    head: [["Employer", "Site", "Quota", "Used", "Available", "Utilization"]],
    body: sites.map(s => [s.employer_name, s.site_name, s.total_quota_slots, s.used_slots, s.available_slots, `${(s.quota_utilisation_pct || 0).toFixed(1)}%`]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold" },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 5) {
        const pct = parseFloat(d.cell.raw);
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = pct >= 90 ? [220,38,38] : pct >= 75 ? [217,119,6] : [22,163,74];
      }
    },
  });
  doc.save(`SiteQuota_${today.replace(/\s+/g, "-")}.pdf`);
}

function exportMissingPDF(alerts, employerName) {
  // eslint-disable-next-line new-cap
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const today = pdfHeader(doc, "MISSING DOCUMENTS REPORT", employerName || "All Employers", true);
  const ALL_FIELDS = ["Passport","Visa Stamp","Insurance","Work Permit Fee","Medical"];
  autoTable(doc, {
    startY: 28,
    head: [["Employer","Site","Emp ID","Full Name","Passport","Visa Stamp","Insurance","WPF","Medical","Missing"]],
    body: alerts.map(r => [
      r.employer_name, r.site_name, r.employee_number, r.full_name,
      ...ALL_FIELDS.map(f => r.missing_fields.includes(f) ? "MISSING" : "SET"),
      `${r.missing_fields.length}/5`,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold" },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index >= 4 && d.column.index <= 8) {
        if (d.cell.raw === "MISSING") { d.cell.styles.fillColor = [254,242,242]; d.cell.styles.textColor = [220,38,38]; d.cell.styles.fontStyle = "bold"; }
        else { d.cell.styles.fillColor = [240,253,244]; d.cell.styles.textColor = [22,163,74]; }
      }
    },
  });
  doc.save(`MissingDocs_${today.replace(/\s+/g, "-")}.pdf`);
}

function exportExpiryByTypePDF(reportData, employerName) {
  // eslint-disable-next-line new-cap
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const docLabel = reportData.docType === "all" ? "All Documents" : reportData.docTypeLabel || reportData.docType;
  const dateRange = `${reportData.dateFrom || "—"} to ${reportData.dateTo || "—"}`;
  const subtitle = `${employerName || "All Employers"} | ${docLabel} | ${dateRange}`;
  const today = pdfHeader(doc, "EXPIRY REPORT BY TYPE", subtitle, true);
  const showDocCol = reportData.docType === "all";
  const head = showDocCol
    ? [["Emp ID", "Full Name", "Nationality", "Employer", "Site", "Document", "Expiry Date", "Days", "Status"]]
    : [["Emp ID", "Full Name", "Nationality", "Employer", "Site", "Expiry Date", "Days", "Status"]];
  const body = reportData.alerts.map(a => {
    const days = a.days_remaining < 0 ? `${a.days_remaining}d` : `+${a.days_remaining}d`;
    return showDocCol
      ? [a.employee_number, a.full_name, a.nationality || "—", a.employer_name, a.site_name, a.expiry_type, a.expiry_date, days, a.status]
      : [a.employee_number, a.full_name, a.nationality || "—", a.employer_name, a.site_name, a.expiry_date, days, a.status];
  });
  const statusColIdx = showDocCol ? 8 : 7;
  autoTable(doc, {
    startY: 28,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold" },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === statusColIdx) {
        const s = pdfStatusStyle(d.cell.raw); d.cell.styles.fillColor = s.fillColor; d.cell.styles.textColor = s.textColor; d.cell.styles.fontStyle = s.fontStyle;
      }
    },
  });
  doc.save(`ExpiryReport_${docLabel.replace(/\s+/g,"-")}_${today.replace(/\s+/g,"-")}.pdf`);
}

function exportReportPDF(reportData, employerName) {
  if (reportData.type === "compliance" || reportData.type === "noncompliant") exportCompliancePDF(reportData.employees, employerName);
  else if (reportData.type === "expiry") exportExpiryPDF(reportData.alerts, employerName);
  else if (reportData.type === "missing") exportMissingPDF(reportData.alerts, employerName);
  else if (reportData.type === "quota") exportQuotaPDF(reportData.sites);
  else if (reportData.type === "expiry_by_type") exportExpiryByTypePDF(reportData, employerName);
}

function exportReportExcel(reportData, employerName) {
  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("en-GB");

  if (reportData.type === "compliance" || reportData.type === "noncompliant") {
    const { employees } = reportData;
    const score = calcComplianceScore(employees);
    const summaryWs = XLSX.utils.aoa_to_sheet([
      ["COMPLIANCE REPORT"],
      ["Employer:", employerName || "All Employers"],
      ["Generated:", today],
      [],
      ["Total Employees:", employees.length],
      ["Compliance Score:", `${score}%`],
      ["Expired docs:", employees.reduce((n,e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Expired").length, 0)],
      ["Critical docs:", employees.reduce((n,e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Critical").length, 0)],
      ["Warning docs:", employees.reduce((n,e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Warning").length, 0)],
    ]);
    summaryWs["!cols"] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    const headers = ["Employer","Site","Emp ID","Full Name","Passport No.","Nationality","Job Title","Passport Status","Passport Expiry","Visa Stamp Status","Visa Stamp Expiry","Insurance Status","Insurance Expiry","WPF Status","WPF Expiry","Medical Status","Medical Expiry"];
    const rows = employees.map(emp => [
      emp.employer_name, emp.site_name, emp.employee_number, emp.full_name,
      emp.passport_number || "", emp.nationality || "", emp.job_title || "",
      emp.passport_status?.status || "", emp.passport_expiry || "",
      emp.visa_stamp_status?.status || "", emp.visa_stamp_expiry || "",
      emp.insurance_status?.status || "", emp.insurance_expiry || "",
      emp.work_permit_fee_status?.status || "", emp.work_permit_fee_expiry || "",
      emp.medical_status?.status || "", emp.medical_expiry || "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [20,22,14,28,18,16,20,16,14,16,14,16,14,14,12,14,12].map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Employees");

  } else if (reportData.type === "expiry") {
    const headers = ["Employer","Site","Emp ID","Full Name","Document","Expiry Date","Days Remaining","Status"];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...reportData.alerts.map(a => [a.employer_name, a.site_name, a.employee_number, a.full_name, a.expiry_type, a.expiry_date, a.days_remaining, a.status])]);
    ws["!cols"] = [20,22,14,28,16,14,16,12].map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Expiry Alerts");

  } else if (reportData.type === "missing") {
    const headers = ["Employer","Site","Emp ID","Full Name","Passport","Visa Stamp","Insurance","Work Permit Fee","Medical","Missing Count"];
    const ALL_FIELDS = ["Passport","Visa Stamp","Insurance","Work Permit Fee","Medical"];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...reportData.alerts.map(r => [
      r.employer_name, r.site_name, r.employee_number, r.full_name,
      ...ALL_FIELDS.map(f => r.missing_fields.includes(f) ? "MISSING" : "SET"),
      `${r.missing_fields.length}/5`,
    ])]);
    ws["!cols"] = [20,20,14,28,10,12,12,16,10,14].map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Missing Documents");

  } else if (reportData.type === "quota") {
    const headers = ["Employer","Site","Total Quota","Used Slots","Available","Utilization %"];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...reportData.sites.map(s => [s.employer_name, s.site_name, s.total_quota_slots, s.used_slots, s.available_slots, `${(s.quota_utilisation_pct || 0).toFixed(1)}%`])]);
    ws["!cols"] = [24,24,14,12,12,14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Site Quota");

  } else if (reportData.type === "expiry_by_type") {
    const docLabel = reportData.docTypeLabel || reportData.docType;
    const dateRange = `${reportData.dateFrom || "start"} to ${reportData.dateTo || "end"}`;
    const summaryWs = XLSX.utils.aoa_to_sheet([
      ["EXPIRY REPORT BY TYPE"],
      ["Employer:",    employerName || "All Employers"],
      ["Document:",    docLabel],
      ["Date Range:",  dateRange],
      ["Generated:",   today],
      [],
      ["Total:", reportData.alerts.length],
      ["Expired:",  reportData.summary?.expired  ?? 0],
      ["Critical:", reportData.summary?.critical ?? 0],
      ["Warning:",  reportData.summary?.warning  ?? 0],
      ["Valid:",    reportData.summary?.total ? reportData.summary.total - (reportData.summary.expired + reportData.summary.critical + reportData.summary.warning) : 0],
    ]);
    summaryWs["!cols"] = [{ wch: 18 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    const showDocCol = reportData.docType === "all";
    const headers = showDocCol
      ? ["Emp ID","Full Name","Nationality","Employer","Site","Document","Expiry Date","Days Remaining","Status"]
      : ["Emp ID","Full Name","Nationality","Employer","Site","Expiry Date","Days Remaining","Status"];
    const rows = reportData.alerts.map(a => showDocCol
      ? [a.employee_number, a.full_name, a.nationality || "", a.employer_name, a.site_name, a.expiry_type, a.expiry_date, a.days_remaining, a.status]
      : [a.employee_number, a.full_name, a.nationality || "", a.employer_name, a.site_name, a.expiry_date, a.days_remaining, a.status]
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = (showDocCol ? [14,28,16,22,22,16,14,16,12] : [14,28,16,22,22,14,16,12]).map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Expiry Report");
  }

  XLSX.writeFile(wb, `WPTracker_Report_${today.replace(/\//g,"-")}.xlsx`);
}

const REPORT_TYPES = [
  { value: "expiry_by_type", label: "Expiry Report by Type & Date Range" },
  { value: "compliance",     label: "Employer Compliance Report" },
  { value: "expiry",         label: "Expiry Pipeline Report" },
  { value: "noncompliant",   label: "Non-Compliant Employees" },
  { value: "missing",        label: "Missing Documents Report" },
  { value: "quota",          label: "Site Quota Report" },
];

const DOC_TYPES = [
  { value: "all",              label: "All Documents" },
  { value: "work_permit_fee",  label: "Work Permit Fee" },
  { value: "passport",         label: "Passport" },
  { value: "visa_stamp",       label: "Visa Stamp" },
  { value: "insurance",        label: "Insurance" },
  { value: "medical",          label: "Medical" },
];

const ReportPreview = ({ data }) => {
  if (data.type === "compliance" || data.type === "noncompliant") {
    const { employees } = data;
    const score    = calcComplianceScore(employees);
    const expired  = employees.reduce((n,e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Expired").length, 0);
    const critical = employees.reduce((n,e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Critical").length, 0);
    const warning  = employees.reduce((n,e) => n + DOC_STATUS_FIELDS.filter(f => e[f.key]?.status === "Warning").length, 0);
    const bySite = {};
    for (const emp of employees) {
      const k = `${emp.employer_name} — ${emp.site_name}`;
      if (!bySite[k]) bySite[k] = []; bySite[k].push(emp);
    }
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: "#f8fafc" }}>
          {[
            { label: "Employees",        value: employees.length, color: C.text },
            { label: "Compliance Score", value: `${score}%`,      color: score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626" },
            { label: "Expired",          value: expired,           color: expired  > 0 ? "#b91c1c" : "#16a34a" },
            { label: "Critical",         value: critical,          color: critical > 0 ? "#f97316" : "#16a34a" },
            { label: "Warning",          value: warning,           color: warning  > 0 ? "#ca8a04" : "#16a34a" },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: "16px 20px", borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontFamily: C.sans, fontSize: 10, color: C.textSub, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
        {Object.entries(bySite).map(([siteName, emps]) => (
          <div key={siteName}>
            <div style={{ padding: "9px 20px", background: "#f1f5f9", borderBottom: `1px solid ${C.border}`, fontFamily: C.sans, fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {siteName} <span style={{ fontWeight: 400 }}>({emps.length})</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Emp ID","Name","Passport No.","Nationality","Passport","Visa Stamp","Insurance","WPF","Medical"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textSub, fontSize: 10, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emps.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: "8px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{emp.employee_number}</td>
                      <td style={{ padding: "8px 12px", color: C.text, fontWeight: 500, whiteSpace: "nowrap" }}>{emp.full_name}</td>
                      <td style={{ padding: "8px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{emp.passport_number || "—"}</td>
                      <td style={{ padding: "8px 12px", color: C.textSub }}>{emp.nationality || "—"}</td>
                      {DOC_STATUS_FIELDS.map(f => {
                        const s = emp[f.key]?.status;
                        const cfg = STATUS_CONFIG[s];
                        return (
                          <td key={f.key} style={{ padding: "6px 12px" }}>
                            {s ? (
                              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, background: cfg?.bg || "#f8fafc", color: cfg?.color || C.textMuted, fontWeight: 600, fontSize: 10, letterSpacing: "0.05em" }}>
                                {cfg?.label || s}
                              </span>
                            ) : <span style={{ color: C.textMuted }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {employees.length === 0 && <div style={{ padding: 40, textAlign: "center", fontFamily: C.sans, color: C.textMuted }}>No employees found</div>}
      </div>
    );
  }

  if (data.type === "expiry") {
    const { alerts, summary } = data;
    const byMonth = {};
    for (const a of alerts) { const m = a.expiry_date.substring(0, 7); if (!byMonth[m]) byMonth[m] = []; byMonth[m].push(a); }
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: "#f8fafc" }}>
          {[{ label: "Total Alerts", value: summary.total }, { label: "Expired", value: summary.expired }, { label: "Critical", value: summary.critical }, { label: "Warning", value: summary.warning }].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: "16px 20px", borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 700, color: C.text }}>{s.value}</div>
              <div style={{ fontFamily: C.sans, fontSize: 10, color: C.textSub, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
        {Object.entries(byMonth).map(([month, monthAlerts]) => {
          const label = new Date(month + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
          return (
            <div key={month}>
              <div style={{ padding: "9px 20px", background: "#f1f5f9", borderBottom: `1px solid ${C.border}`, fontFamily: C.sans, fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label} <span style={{ fontWeight: 400 }}>({monthAlerts.length} documents)</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Employer","Site","Emp ID","Name","Document","Expiry Date","Days","Status"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textSub, fontSize: 10, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthAlerts.map((a, i) => {
                      const cfg = STATUS_CONFIG[a.status];
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                          <td style={{ padding: "8px 12px", color: C.textSub }}>{a.employer_name}</td>
                          <td style={{ padding: "8px 12px", color: C.textSub }}>{a.site_name}</td>
                          <td style={{ padding: "8px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{a.employee_number}</td>
                          <td style={{ padding: "8px 12px", color: C.text, fontWeight: 500, whiteSpace: "nowrap" }}>{a.full_name}</td>
                          <td style={{ padding: "8px 12px", color: C.textSub }}>{a.expiry_type}</td>
                          <td style={{ padding: "8px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{a.expiry_date}</td>
                          <td style={{ padding: "8px 12px", fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: a.days_remaining < 0 ? "#6b7280" : a.days_remaining < 15 ? "#dc2626" : a.days_remaining < 30 ? "#ea580c" : "#d97706" }}>
                            {a.days_remaining < 0 ? `${a.days_remaining}d` : `+${a.days_remaining}d`}
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, background: cfg?.bg || "#f8fafc", color: cfg?.color || C.textMuted, fontWeight: 600, fontSize: 10, letterSpacing: "0.05em" }}>
                              {cfg?.label || a.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && <div style={{ padding: 40, textAlign: "center", fontFamily: C.sans, color: C.textMuted }}>No alerts in this window</div>}
      </div>
    );
  }

  if (data.type === "expiry_by_type") {
    const { alerts, summary, docType, docTypeLabel, dateFrom, dateTo } = data;
    const showDocCol = docType === "all";
    const expired  = summary?.expired  ?? 0;
    const critical = summary?.critical ?? 0;
    const warning  = summary?.warning  ?? 0;
    const valid    = (summary?.total ?? 0) - expired - critical - warning;
    const docLabel = docTypeLabel || DOC_TYPES.find(d => d.value === docType)?.label || docType;
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        {/* Header bar */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: "#f8fafc", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", padding: "3px 12px", borderRadius: 20, fontFamily: C.sans, fontSize: 12, fontWeight: 700 }}>{docLabel}</span>
          {dateFrom && <span style={{ color: C.textSub, fontFamily: C.mono, fontSize: 12 }}>{dateFrom} → {dateTo}</span>}
          <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12 }}>{alerts.length} employees</span>
        </div>
        {/* Summary stats */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
          {[
            { label: "Total",    value: alerts.length, color: C.text },
            { label: "Expired",  value: expired,       color: expired  > 0 ? "#b91c1c" : "#16a34a" },
            { label: "Critical", value: critical,       color: critical > 0 ? "#f97316" : "#16a34a" },
            { label: "Warning",  value: warning,        color: warning  > 0 ? "#ca8a04" : "#16a34a" },
            { label: "Valid",    value: valid,           color: valid    > 0 ? "#16a34a" : C.textMuted },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: "14px 20px", borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontFamily: C.sans, fontSize: 10, color: C.textSub, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Emp ID","Name","Nationality","Employer","Site", ...(showDocCol ? ["Document"] : []),"Expiry Date","Days","Status"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textSub, fontSize: 10, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => {
                const cfg = STATUS_CONFIG[a.status];
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "8px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{a.employee_number}</td>
                    <td style={{ padding: "8px 12px", color: C.text, fontWeight: 500, whiteSpace: "nowrap" }}>{a.full_name}</td>
                    <td style={{ padding: "8px 12px", color: C.textSub }}>{a.nationality || "—"}</td>
                    <td style={{ padding: "8px 12px", color: C.textSub }}>{a.employer_name}</td>
                    <td style={{ padding: "8px 12px", color: C.textSub }}>{a.site_name}</td>
                    {showDocCol && <td style={{ padding: "8px 12px", color: C.textSub, fontWeight: 500 }}>{a.expiry_type}</td>}
                    <td style={{ padding: "8px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{a.expiry_date}</td>
                    <td style={{ padding: "8px 12px", fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: daysColor(a.days_remaining) }}>
                      {a.days_remaining < 0 ? `${a.days_remaining}d` : `+${a.days_remaining}d`}
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, background: cfg?.bg || "#f8fafc", color: cfg?.color || C.textMuted, fontWeight: 600, fontSize: 10, letterSpacing: "0.05em" }}>
                        {cfg?.label || a.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {alerts.length === 0 && <div style={{ padding: 40, textAlign: "center", fontFamily: C.sans, color: C.textMuted }}>No documents expiring in this date range</div>}
      </div>
    );
  }

  if (data.type === "missing") {
    const { alerts } = data;
    const ALL_FIELDS = ["Passport","Visa Stamp","Insurance","Work Permit Fee","Medical"];
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: "#f0f9ff" }}>
          <span style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: "#0891b2" }}>{alerts.length} employees with missing document information</span>
          <span style={{ fontFamily: C.sans, fontSize: 12, color: C.textSub, marginLeft: 12 }}>Sorted by number of missing fields (most incomplete first)</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Employer","Site","Emp ID","Name","Passport","Visa Stamp","Insurance","Work Permit Fee","Medical","Missing Count"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textSub, fontSize: 10, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map(row => (
              <tr key={row.employee_id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: "9px 12px", color: C.textSub }}>{row.employer_name}</td>
                <td style={{ padding: "9px 12px", color: C.textSub }}>{row.site_name}</td>
                <td style={{ padding: "9px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{row.employee_number}</td>
                <td style={{ padding: "9px 12px", color: C.text, fontWeight: 500, whiteSpace: "nowrap" }}>{row.full_name}</td>
                {ALL_FIELDS.map(f => {
                  const missing = row.missing_fields.includes(f);
                  return (
                    <td key={f} style={{ padding: "6px 12px" }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, background: missing ? "#fef2f2" : "#f0fdf4", color: missing ? "#dc2626" : "#16a34a", fontWeight: 600, fontSize: 10 }}>
                        {missing ? "MISSING" : "SET"}
                      </span>
                    </td>
                  );
                })}
                <td style={{ padding: "9px 12px" }}>
                  <span style={{ fontFamily: C.mono, fontWeight: 700, color: row.missing_fields.length === 5 ? "#dc2626" : row.missing_fields.length >= 3 ? "#c2410c" : "#a16207" }}>
                    {row.missing_fields.length}/5
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {alerts.length === 0 && <div style={{ padding: 40, textAlign: "center", fontFamily: C.sans, color: "#16a34a", fontWeight: 600 }}>✓ All employees have complete records</div>}
      </div>
    );
  }

  if (data.type === "quota") {
    const { sites } = data;
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Employer","Site","Total Quota","Used","Available","Utilization"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: C.textSub, fontSize: 10, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map(s => {
              const pct = s.quota_utilisation_pct || 0;
              const barColor = pct >= 90 ? "#dc2626" : pct >= 75 ? "#d97706" : "#16a34a";
              return (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td style={{ padding: "12px 16px", color: C.textSub }}>{s.employer_name}</td>
                  <td style={{ padding: "12px 16px", color: C.text, fontWeight: 500 }}>{s.site_name}</td>
                  <td style={{ padding: "12px 16px", color: C.text, fontFamily: C.mono }}>{s.total_quota_slots}</td>
                  <td style={{ padding: "12px 16px", color: C.text, fontFamily: C.mono }}>{s.used_slots}</td>
                  <td style={{ padding: "12px 16px", fontFamily: C.mono, fontWeight: 600, color: s.available_slots === 0 ? "#dc2626" : "#16a34a" }}>{s.available_slots}</td>
                  <td style={{ padding: "12px 16px", minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: barColor, minWidth: 40 }}>{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sites.length === 0 && <div style={{ padding: 40, textAlign: "center", fontFamily: C.sans, color: C.textMuted }}>No sites found</div>}
      </div>
    );
  }
  return null;
};

const ReportsTab = () => {
  const [reportType, setReportType] = useState("expiry_by_type");
  const [employerId, setEmployerId] = useState("");
  const [expiryDays, setExpiryDays] = useState(60);
  const [docType, setDocType] = useState("work_permit_fee");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return d.toISOString().split("T")[0];
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const { data: employers } = useFetch(`${API}/employers/`);
  const selectedEmployer = employers?.find(e => String(e.id) === employerId);

  // Quick month picker helpers
  const setMonth = (offset) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    setDateFrom(from.toISOString().split("T")[0]);
    setDateTo(to.toISOString().split("T")[0]);
  };

  const generate = async () => {
    setLoading(true); setErr(null); setReportData(null);
    try {
      if (reportType === "expiry_by_type") {
        let url = `${API}/alerts/expiry-by-type?doc_type=${docType}`;
        if (employerId) url += `&employer_id=${employerId}`;
        if (dateFrom)   url += `&date_from=${dateFrom}`;
        if (dateTo)     url += `&date_to=${dateTo}`;
        const data = await apiFetch(url).then(r => r.json());
        const docTypeLabel = DOC_TYPES.find(d => d.value === docType)?.label || docType;
        setReportData({ type: "expiry_by_type", alerts: data.alerts || [], summary: data, docType, docTypeLabel, dateFrom, dateTo });
      } else if (reportType === "compliance" || reportType === "noncompliant") {
        const empUrl = employerId
          ? `${API}/employees/?employer_id=${employerId}&resigned=false&limit=500`
          : `${API}/employees/?resigned=false&limit=500`;
        const [empRes, empListRes, siteRes] = await Promise.all([
          apiFetch(empUrl).then(r => r.json()),
          apiFetch(`${API}/employers/`).then(r => r.json()),
          apiFetch(`${API}/sites/`).then(r => r.json()),
        ]);
        const empMap  = Object.fromEntries(empListRes.map(e => [e.id, e.name]));
        const siteMap = Object.fromEntries(siteRes.map(s => [s.id, s.site_name]));
        let employees = empRes.map(e => ({
          ...e,
          employer_name: empMap[e.employer_id]  || `Employer ${e.employer_id}`,
          site_name:     siteMap[e.site_id]     || `Site ${e.site_id}`,
        }));
        if (reportType === "noncompliant") {
          employees = employees.filter(emp => DOC_STATUS_FIELDS.some(f => ["Expired","Critical"].includes(emp[f.key]?.status)));
        }
        setReportData({ type: reportType, employees });
      } else if (reportType === "expiry") {
        const url = employerId
          ? `${API}/alerts/expiring?days=${expiryDays}&employer_id=${employerId}`
          : `${API}/alerts/expiring?days=${expiryDays}`;
        const data = await apiFetch(url).then(r => r.json());
        setReportData({ type: "expiry", alerts: data.alerts, summary: data });
      } else if (reportType === "missing") {
        const url = employerId ? `${API}/alerts/missing?employer_id=${employerId}` : `${API}/alerts/missing`;
        const data = await apiFetch(url).then(r => r.json());
        setReportData({ type: "missing", alerts: data.alerts, total: data.total });
      } else if (reportType === "quota") {
        const url = employerId ? `${API}/sites/?employer_id=${employerId}` : `${API}/sites/`;
        const [siteRes, empListRes] = await Promise.all([
          apiFetch(url).then(r => r.json()),
          apiFetch(`${API}/employers/`).then(r => r.json()),
        ]);
        const empMap = Object.fromEntries(empListRes.map(e => [e.id, e.name]));
        setReportData({ type: "quota", sites: siteRes.map(s => ({ ...s, employer_name: empMap[s.employer_id] || `Employer ${s.employer_id}` })) });
      }
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const sel = { fontFamily: C.sans, fontSize: 13, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text };
  const lbl = { fontFamily: C.sans, fontSize: 11, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 20 }}>Generate Report</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={lbl}>Report Type</label>
            <select value={reportType} onChange={e => { setReportType(e.target.value); setReportData(null); }} style={{ ...sel, minWidth: 260 }}>
              {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Employer</label>
            <select value={employerId} onChange={e => { setEmployerId(e.target.value); setReportData(null); }} style={{ ...sel, minWidth: 200 }}>
              <option value="">All Employers</option>
              {(employers || []).map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
            </select>
          </div>

          {/* ── Expiry by type controls ── */}
          {reportType === "expiry_by_type" && (<>
            <div>
              <label style={lbl}>Document Type</label>
              <select value={docType} onChange={e => { setDocType(e.target.value); setReportData(null); }} style={{ ...sel, minWidth: 180 }}>
                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>From Date</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setReportData(null); }} style={{ ...sel }} />
            </div>
            <div>
              <label style={lbl}>To Date</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setReportData(null); }} style={{ ...sel }} />
            </div>
            <div>
              <label style={lbl}>Quick Select</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { label: "This Month",   offset: 0 },
                  { label: "Next Month",   offset: 1 },
                  { label: "In 2 Months",  offset: 2 },
                  { label: "In 3 Months",  offset: 3 },
                ].map(({ label, offset }) => (
                  <button key={label} type="button" onClick={() => { setMonth(offset); setReportData(null); }} style={{
                    background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`,
                    padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    fontFamily: C.sans, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
                  }}>{label}</button>
                ))}
              </div>
            </div>
          </>)}

          {reportType === "expiry" && (
            <div>
              <label style={lbl}>Window</label>
              <select value={expiryDays} onChange={e => { setExpiryDays(Number(e.target.value)); setReportData(null); }} style={sel}>
                <option value={30}>Next 30 days</option>
                <option value={60}>Next 60 days</option>
                <option value={90}>Next 90 days</option>
                <option value={180}>Next 180 days</option>
              </select>
            </div>
          )}
        </div>

        {/* Action row */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={generate} disabled={loading} style={{ background: C.accent, color: "#fff", border: "none", padding: "9px 22px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Loading…" : "Generate Preview"}
          </button>
          {reportData && (<>
            <button onClick={() => exportReportPDF(reportData, selectedEmployer?.name)} style={{ background: "#1e293b", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ↓ Export PDF
            </button>
            <button onClick={() => exportReportExcel(reportData, selectedEmployer?.name)} style={{ background: "#166534", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ↓ Export Excel
            </button>
            <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12 }}>
              {reportData.alerts?.length ?? reportData.employees?.length ?? reportData.sites?.length ?? 0} records
            </span>
          </>)}
        </div>
        {err && <div style={{ marginTop: 12, color: C.accent, fontFamily: C.sans, fontSize: 13 }}>{err}</div>}
      </div>
      {reportData && <ReportPreview data={reportData} />}
    </div>
  );
};

// ── Settings Tab ──────────────────────────────────────────
const SettingsTab = () => {
  const { data: stats, refetch: refetchStats } = useFetch(`${API}/admin/stats`);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [message, setMessage]         = useState(null); // { type: "success"|"error", text }

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleWipe = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/admin/wipe`, { method: "POST" });
      if (res.ok) { showMsg("success", "All data wiped successfully."); refetchStats(); }
      else { const d = await res.json(); showMsg("error", d.detail || "Wipe failed."); }
    } catch (e) { showMsg("error", e.message); }
    setLoading(false);
    setConfirmWipe(false);
  };

  const handleSeed = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/admin/seed`, { method: "POST" });
      if (res.ok) { showMsg("success", "Demo data loaded successfully."); refetchStats(); }
      else { const d = await res.json(); showMsg("error", d.detail || "Seed failed."); }
    } catch (e) { showMsg("error", e.message); }
    setLoading(false);
  };

  const statItems = [
    { label: "Employers",   value: stats?.employers,  accent: "#3b82f6" },
    { label: "Sites",       value: stats?.sites,       accent: "#a855f7" },
    { label: "Employees",   value: stats?.employees,   accent: C.accent  },
    { label: "Audit Logs",  value: stats?.audit_logs,  accent: "#d97706" },
    { label: "Users",       value: stats?.users,       accent: "#0891b2" },
  ];

  return (
    <div>

      {/* Flash message */}
      {message && (
        <div style={{
          background: message.type === "success" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${message.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          color: message.type === "success" ? "#16a34a" : "#dc2626",
          padding: "12px 16px", borderRadius: 10, fontFamily: C.sans, fontSize: 13,
          marginBottom: 24, fontWeight: 500,
        }}>
          {message.type === "success" ? "✓" : "⚠"} {message.text}
        </div>
      )}

      {/* Data overview */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.pageBg }}>
          <div style={{ color: C.text, fontFamily: C.sans, fontSize: 14, fontWeight: 700 }}>Database Overview</div>
          <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12, marginTop: 2 }}>Current record counts across all tables</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0 }}>
          {statItems.map(({ label, value, accent }, i) => (
            <div key={label} style={{
              padding: "20px 22px",
              borderRight: i < statItems.length - 1 ? `1px solid ${C.border}` : "none",
              borderTop: `3px solid ${accent}`,
            }}>
              <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: C.sans, marginBottom: 8 }}>{label}</div>
              <div style={{ color: C.text, fontSize: 30, fontWeight: 800, fontFamily: C.mono, lineHeight: 1 }}>{value ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Data Management */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.pageBg }}>
          <div style={{ color: C.text, fontFamily: C.sans, fontSize: 14, fontWeight: 700 }}>Data Management</div>
          <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12, marginTop: 2 }}>Load demo data for testing or wipe everything to start fresh</div>
        </div>
        <div style={{ padding: "22px" }}>

          {/* Load demo data */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12 }}>
            <div>
              <div style={{ color: C.text, fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>Load Demo Data</div>
              <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12, marginTop: 3 }}>Populate the database with sample employers, sites and employees for testing</div>
            </div>
            <button
              onClick={handleSeed}
              disabled={loading}
              style={{
                background: "#f0fdf4", color: "#16a34a",
                border: "1px solid #bbf7d0",
                padding: "8px 20px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: C.sans, fontSize: 13, fontWeight: 600,
                opacity: loading ? 0.6 : 1, flexShrink: 0, marginLeft: 20,
              }}
            >
              {loading ? "Working..." : "Load Demo Data"}
            </button>
          </div>

          {/* Wipe data */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
            <div>
              <div style={{ color: "#dc2626", fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>Wipe All Data</div>
              <div style={{ color: "#ef4444", fontFamily: C.sans, fontSize: 12, marginTop: 3, opacity: 0.8 }}>Permanently deletes all employers, sites, employees and audit logs. Users are kept.</div>
            </div>
            <div style={{ flexShrink: 0, marginLeft: 20 }}>
              {!confirmWipe ? (
                <button
                  onClick={() => setConfirmWipe(true)}
                  disabled={loading}
                  style={{
                    background: "#fee2e2", color: "#dc2626",
                    border: "1px solid #fca5a5",
                    padding: "8px 20px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: C.sans, fontSize: 13, fontWeight: 600,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Wipe All Data
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#dc2626", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>Are you sure?</span>
                  <button
                    onClick={handleWipe}
                    disabled={loading}
                    style={{
                      background: "#dc2626", color: "#fff", border: "none",
                      padding: "8px 16px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
                      fontFamily: C.sans, fontSize: 13, fontWeight: 700,
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    {loading ? "Wiping..." : "Yes, wipe everything"}
                  </button>
                  <button
                    onClick={() => setConfirmWipe(false)}
                    style={{
                      background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`,
                      padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                      fontFamily: C.sans, fontSize: 13,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Root App ──────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [currentUser, setCurrentUser] = useState(null);
  const [showUsers, setShowUsers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Register the global unauth handler
  _onUnauth = () => { clearToken(); setAuthed(false); setCurrentUser(null); };

  useEffect(() => {
    if (authed) {
      apiFetch(`${API}/auth/me`).then(r => r.ok ? r.json() : null).then(d => { if (d) setCurrentUser(d); });
    }
  }, [authed]);

  const [tab, setTab] = useState("OVERVIEW");
  const [alertNav, setAlertNav] = useState({ view: "expiring", filter: "All", days: 60 });
  const [alertNavKey, setAlertNavKey] = useState(0);

  const handleDashNav = (newTab, opts = {}) => {
    if (newTab === "ALERTS") {
      setAlertNav({ view: opts.view || "expiring", filter: opts.filter || "All", days: opts.days || 60 });
      setAlertNavKey(k => k + 1);
    }
    setTab(newTab);
  };
  const { data: headerStats } = useFetch(`${API}/dashboard/stats`);
  const criticalCount = headerStats?.total_alerts_critical ?? 0;
  const expiredCount  = headerStats?.total_alerts_expired  ?? 0;
  const urgentTotal   = criticalCount + expiredCount;

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <div style={{ background: C.pageBg, minHeight: "100vh", color: C.text, fontFamily: C.sans }}>
      <GlobalStyles />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "0 32px",
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        <div className="dg-header" style={{ display: "flex", alignItems: "center", gap: 20, height: 62 }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `linear-gradient(135deg, ${C.accent}, #b91c1c)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 2px 8px ${C.accent}40`,
            }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: C.sans }}>D</span>
            </div>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                DocGuard
                {urgentTotal > 0 && (
                  <span style={{
                    background: "#dc2626", color: "#fff",
                    fontSize: 10, fontWeight: 700, fontFamily: C.mono,
                    padding: "1px 7px", borderRadius: 10, marginLeft: 8,
                    boxShadow: "0 0 8px rgba(220,38,38,0.4)",
                    verticalAlign: "middle",
                  }}>{urgentTotal}</span>
                )}
              </div>
              <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.02em", lineHeight: 1 }}>Expatriate Compliance Management <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMuted, opacity: 0.6 }}>v1.0.0</span></div>
            </div>
          </div>

          <div style={{ width: 1, height: 28, background: C.border }} />

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 8px rgba(22,163,74,0.5)" }} />
            <span style={{ color: C.textMuted, fontSize: 12, fontWeight: 500 }}>Live</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* User / Logout */}
          {currentUser && (
            <span style={{ color: C.textMuted, fontSize: 12, fontFamily: C.mono }}>{currentUser.username}</span>
          )}
          {currentUser?.is_admin && (
            <>
              <button
                onClick={() => setShowUsers(true)}
                style={{
                  background: "none", color: C.textSub,
                  border: `1px solid ${C.border}`,
                  padding: "5px 14px", borderRadius: 8, cursor: "pointer",
                  fontFamily: C.sans, fontSize: 12, fontWeight: 500,
                }}
              >
                Users
              </button>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  background: "none", color: C.textSub,
                  border: `1px solid ${C.border}`,
                  padding: "5px 14px", borderRadius: 8, cursor: "pointer",
                  fontFamily: C.sans, fontSize: 12, fontWeight: 500,
                }}
              >
                Settings
              </button>
            </>
          )}
          <button
            onClick={() => { clearToken(); setAuthed(false); setCurrentUser(null); }}
            style={{
              background: "none", color: C.textSub,
              border: `1px solid ${C.border}`,
              padding: "5px 14px", borderRadius: 8, cursor: "pointer",
              fontFamily: C.sans, fontSize: 12, fontWeight: 500,
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
      {showUsers    && <UsersModal onClose={() => setShowUsers(false)} currentUserId={currentUser?.id} />}
      {showSettings && (
        <Modal wide title="Settings" onClose={() => setShowSettings(false)}>
          <SettingsTab />
        </Modal>
      )}

      {/* Main content */}
      <div className="dg-main" style={{ padding: "28px 32px" }}>
        <Tabs tabs={["OVERVIEW", "ALERTS", "EMPLOYEES", "EMPLOYERS", "REPORTS"]} active={tab} onChange={setTab} />
        <div key={tab} style={{ animation: "slideTab 0.18s ease" }}>
          {tab === "OVERVIEW"  && <DashboardTab onNavigate={handleDashNav} />}
          {tab === "ALERTS"    && <AlertsTab key={alertNavKey} initialView={alertNav.view} initialFilter={alertNav.filter} initialDays={alertNav.days} />}
          {tab === "EMPLOYEES" && <EmployeesTab />}
          {tab === "EMPLOYERS" && <EmployersTab />}
          {tab === "REPORTS"   && <ReportsTab />}
        </div>
      </div>
    </div>
  );
}
