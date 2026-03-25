import { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import appLogo from "./assets/logo.png";

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
  // Quota slot inline edit
  const [editingSlotExpiry, setEditingSlotExpiry] = useState(false);
  const [newSlotExpiry, setNewSlotExpiry] = useState("");
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotError, setSlotError] = useState(null);

  const handleUpdateSlotExpiry = async () => {
    if (!newSlotExpiry) { setSlotError("Please select a new expiry date."); return; }
    setSlotSaving(true); setSlotError(null);
    try {
      const res = await apiFetch(`${API}/quota-slots/${emp.quota_slot_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiry_date: newSlotExpiry }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSlotError(d.detail?.message || d.detail || "Error updating slot");
      } else {
        // Re-fetch employee to get updated quota slot status
        const empRes = await apiFetch(`${API}/employees/${emp.id}`);
        if (empRes.ok) onUpdated(await empRes.json());
        setEditingSlotExpiry(false);
        setNewSlotExpiry("");
      }
    } catch (e) { setSlotError(e.message); }
    finally { setSlotSaving(false); }
  };

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
    ["passport_expiry","insurance_expiry","work_permit_fee_expiry","medical_expiry"].forEach(f => {
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

          {emp.quota_slot_id && (() => {
            const slotExpired = emp.quota_slot_expired;
            const borderColor = slotExpired ? "#b91c1c" : "#16a34a";
            const bgColor     = slotExpired ? "#fff1f2" : "#f0fdf4";
            const bdColor     = slotExpired ? "#fecaca" : "#bbf7d0";
            return (
              <div style={{ background: bgColor, border: `1px solid ${bdColor}`, borderLeft: `4px solid ${borderColor}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: borderColor, fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    📋 Quota Slot
                  </span>
                  <span style={{ background: slotExpired ? "#fff1f2" : "#f0fdf4", color: borderColor, border: `1px solid ${bdColor}`, padding: "2px 10px", borderRadius: 20, fontSize: 10, fontFamily: C.sans, fontWeight: 700 }}>
                    {slotExpired ? "✗ EXPIRED" : "✓ VALID"}
                  </span>
                </div>

                {/* Slot details */}
                <div style={{ display: "flex", gap: 28, marginBottom: slotExpired ? 12 : 0 }}>
                  <div>
                    <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: C.sans, marginBottom: 2 }}>Slot Number</div>
                    <div style={{ color: C.text, fontFamily: C.mono, fontSize: 13, fontWeight: 600 }}>{emp.quota_slot_number}</div>
                  </div>
                  <div>
                    <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: C.sans, marginBottom: 2 }}>Expiry Date</div>
                    <div style={{ color: borderColor, fontFamily: C.mono, fontSize: 13, fontWeight: 600 }}>{emp.quota_slot_expiry || "—"}</div>
                  </div>
                </div>

                {/* Inline expiry update */}
                {slotExpired && (
                  <div style={{ borderTop: `1px solid ${bdColor}`, paddingTop: 12 }}>
                    {!editingSlotExpiry ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ color: "#b91c1c", fontFamily: C.sans, fontSize: 12 }}>⚠ WPF renewal is blocked until this slot is renewed.</span>
                        <button onClick={() => { setEditingSlotExpiry(true); setNewSlotExpiry(""); setSlotError(null); }} style={{
                          background: "#b91c1c", color: "#fff", border: "none",
                          padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                          fontFamily: C.sans, fontSize: 12, fontWeight: 600,
                          boxShadow: "0 2px 6px rgba(185,28,28,0.3)",
                        }}>Update Expiry</button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ color: C.textSub, fontFamily: C.sans, fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Set new expiry date for slot {emp.quota_slot_number}:</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input type="date" value={newSlotExpiry} onChange={e => setNewSlotExpiry(e.target.value)}
                            style={{ ...inputStyle(false), maxWidth: 180, padding: "7px 10px" }} />
                          <button onClick={handleUpdateSlotExpiry} disabled={slotSaving} style={{
                            background: "#16a34a", color: "#fff", border: "none",
                            padding: "7px 18px", borderRadius: 8, cursor: slotSaving ? "not-allowed" : "pointer",
                            fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: slotSaving ? 0.7 : 1,
                          }}>{slotSaving ? "Saving..." : "Save"}</button>
                          <button onClick={() => { setEditingSlotExpiry(false); setSlotError(null); }} style={{
                            background: "none", color: C.textSub, border: `1px solid ${C.border}`,
                            padding: "7px 14px", borderRadius: 8, cursor: "pointer",
                            fontFamily: C.sans, fontSize: 12,
                          }}>Cancel</button>
                        </div>
                        {slotError && <div style={{ color: "#b91c1c", fontFamily: C.sans, fontSize: 12, marginTop: 6 }}>⚠ {slotError}</div>}
                      </div>
                    )}
                  </div>
                )}

                {/* Non-expired: offer update anyway */}
                {!slotExpired && (
                  <div style={{ marginTop: 4 }}>
                    {!editingSlotExpiry ? (
                      <button onClick={() => { setEditingSlotExpiry(true); setNewSlotExpiry(""); setSlotError(null); }} style={{
                        background: "none", color: "#16a34a", border: "1px solid #bbf7d0",
                        padding: "5px 14px", borderRadius: 8, cursor: "pointer",
                        fontFamily: C.sans, fontSize: 11, fontWeight: 600,
                      }}>Extend Expiry</button>
                    ) : (
                      <div>
                        <div style={{ color: C.textSub, fontFamily: C.sans, fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Set new expiry date:</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input type="date" value={newSlotExpiry} onChange={e => setNewSlotExpiry(e.target.value)}
                            style={{ ...inputStyle(false), maxWidth: 180, padding: "7px 10px" }} />
                          <button onClick={handleUpdateSlotExpiry} disabled={slotSaving} style={{
                            background: "#16a34a", color: "#fff", border: "none",
                            padding: "7px 18px", borderRadius: 8, cursor: slotSaving ? "not-allowed" : "pointer",
                            fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: slotSaving ? 0.7 : 1,
                          }}>{slotSaving ? "Saving..." : "Save"}</button>
                          <button onClick={() => { setEditingSlotExpiry(false); setSlotError(null); }} style={{
                            background: "none", color: C.textSub, border: `1px solid ${C.border}`,
                            padding: "7px 14px", borderRadius: 8, cursor: "pointer",
                            fontFamily: C.sans, fontSize: 12,
                          }}>Cancel</button>
                        </div>
                        {slotError && <div style={{ color: "#b91c1c", fontFamily: C.sans, fontSize: 12, marginTop: 6 }}>⚠ {slotError}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
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
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ color: C.text, fontFamily: C.sans, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{site.site_name}</div>
          {atCapacity && <span style={{ flexShrink: 0, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontFamily: C.sans, fontWeight: 700 }}>QUOTA FULL</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
  "MEDICAL":         { color: "#0891b2", icon: "🏥" },
  "QUOTA SLOT":      { color: "#059669", icon: "🎫" },
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
    "Medical": [],
    "Quota Slot": [],
  };
  (alertData?.alerts || []).forEach(a => {
    if (byType[a.expiry_type]) byType[a.expiry_type].push(a);
  });

  const categorySummary = [
    { key: "Passport",        label: "Passports",       color: "#2563eb", metaKey: "PASSPORTS"       },
    { key: "Work Permit Fee", label: "Work Permit Fee", color: "#f97316", metaKey: "WORK PERMIT FEE" },
    { key: "Insurance",       label: "Insurance",       color: "#ca8a04", metaKey: "INSURANCE"       },
    { key: "Medical",         label: "Medical",         color: "#0891b2", metaKey: "MEDICAL"         },
    { key: "Quota Slot",      label: "Quota Slots",     color: "#059669", metaKey: "QUOTA SLOT"      },
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
        <StatCard label="Quota Slots Expired" value={stats?.total_quota_slots_expired} sub={`${stats?.total_quota_slots_expiring ?? 0} expiring soon`} accent="#059669" glow onClick={() => onNavigate("ALERTS", { view: "expiring", filter: "All", days: 90 })} />
      </div>

      {/* Document health grid */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: C.sans, marginBottom: 12 }}>
          Document Health — 90-Day Window
        </div>
        <div className="dg-doc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
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
          <CategorySection title="MEDICAL"         alerts={byType["Medical"]}         onEmployeeClick={handleEmployeeClick} />
          <CategorySection title="QUOTA SLOT"      alerts={byType["Quota Slot"]}      onEmployeeClick={handleEmployeeClick} />
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
  const DOC_COLS = ["Passport", "Insurance", "Work Permit Fee", "Medical", "Quota Slot"];

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
    emp.insurance_status?.status,
    emp.work_permit_fee_status?.status,
    emp.medical_status?.status,
    emp.quota_slot_expired ? "Expired" : null,
  ].filter(Boolean);
  if (!statuses.length) return null;
  return statuses.reduce((best, s) => (STATUS_RANK[s] || 0) > (STATUS_RANK[best] || 0) ? s : best);
}

const PAGE_SIZE = 50;

const EmployeesTab = () => {
  const { data: employees, loading } = useFetch(`${API}/employees/`);
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
                        {emp.quota_slot_id && (() => {
                          const st = emp.quota_slot_expired ? "Expired" : emp.quota_slot_expiry ? "Valid" : null;
                          const cfg = STATUS_CONFIG[st];
                          return (
                            <span title={`QS: ${st || "no slot"} ${emp.quota_slot_expiry ? `(${emp.quota_slot_expiry})` : ""}`} style={{
                              background: cfg ? cfg.bg : "#f3f4f6",
                              color: cfg ? cfg.color : C.textMuted,
                              border: `1px solid ${cfg ? cfg.color + "40" : C.border}`,
                              padding: "2px 6px", borderRadius: 6,
                              fontSize: 10, fontFamily: C.mono, fontWeight: 700,
                            }}>QS</span>
                          );
                        })()}
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

  const [editEmployer, setEditEmployer] = useState(null); // employer object being edited
  const [editForm, setEditForm]         = useState({});
  const [editError, setEditError]       = useState(null);
  const [editSaving, setEditSaving]     = useState(false);

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

  const handleSaveEmployer = async () => {
    setEditSaving(true); setEditError(null);
    try {
      const res = await apiFetch(`${API}/employers/${editEmployer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) { setEditEmployer(null); refetchEmployers(); }
      else { const d = await res.json(); setEditError(d.detail || "Error saving employer"); }
    } catch (e) { setEditError(e.message); }
    finally { setEditSaving(false); }
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
                  <button onClick={() => { setEditEmployer(employer); setEditForm({ name: employer.name, registration_number: employer.registration_number, contact_name: employer.contact_name || "", contact_email: employer.contact_email || "", contact_phone: employer.contact_phone || "" }); setEditError(null); }} style={{
                    background: "transparent", color: C.textSub, border: `1px solid ${C.border}`,
                    padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                    fontFamily: C.sans, fontSize: 12, fontWeight: 600,
                  }}>✏ Edit</button>
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

      {editEmployer && (
        <Modal title="Edit Employer" onClose={() => { setEditEmployer(null); setEditError(null); }}>
          {editError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontFamily: C.sans, fontSize: 13, marginBottom: 16 }}>⚠ {editError}</div>}
          <InputRow label="Employer Name"       name="name"                value={editForm.name || ""}                onChange={e => setEditForm(f => ({ ...f, [e.target.name]: e.target.value }))} required />
          <InputRow label="Registration Number" name="registration_number" value={editForm.registration_number || ""} onChange={e => setEditForm(f => ({ ...f, [e.target.name]: e.target.value }))} required />
          <InputRow label="Contact Name"        name="contact_name"        value={editForm.contact_name || ""}        onChange={e => setEditForm(f => ({ ...f, [e.target.name]: e.target.value }))} />
          <InputRow label="Contact Email"       name="contact_email"       value={editForm.contact_email || ""}       onChange={e => setEditForm(f => ({ ...f, [e.target.name]: e.target.value }))} />
          <InputRow label="Contact Phone"       name="contact_phone"       value={editForm.contact_phone || ""}       onChange={e => setEditForm(f => ({ ...f, [e.target.name]: e.target.value }))} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setEditEmployer(null); setEditError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }}>Cancel</button>
            <button onClick={handleSaveEmployer} disabled={editSaving} style={{ background: C.accent, color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: editSaving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600, opacity: editSaving ? 0.7 : 1 }}>{editSaving ? "Saving…" : "Save Changes"}</button>
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
  "employee_number,full_name,passport_number,work_permit_number,nationality,occupation,passport_expiry,insurance_expiry,work_permit_fee_expiry,medical_expiry,quota_slot_number,quota_slot_expiry",
  "EMP-100,John Smith,A12345678,WP-2024-00123,British,Engineer,2028-06-15,2026-12-01,2026-09-01,2026-03-15,QS00301620,2026-09-30",
  "EMP-101,,,,,,,2026-07-20,2026-10-01,2026-04-20,,",
].join("\n");

const CSV_CREATE_TEMPLATE = [
  "full_name,employer_name,site_name,passport_number,work_permit_number,nationality,occupation,passport_expiry,insurance_expiry,work_permit_fee_expiry,medical_expiry,quota_slot_number,quota_slot_expiry",
  "John Smith,Gulf Construction LLC,Dubai Marina Site,A12345678,WP-2024-00123,British,Engineer,2028-06-15,2026-12-01,2026-09-01,2026-03-15,QS00301620,2026-09-30",
  "Jane Doe,Gulf Construction LLC,Dubai Marina Site,B98765432,WP-2024-00124,Filipino,Technician,2029-03-20,2027-06-10,2027-03-20,2027-03-20,,",
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
    { col: "occupation",             note: "Job title / occupation — e.g. Site Supervisor, Electrician" },
    { col: "passport_expiry",        note: "Date format: YYYY-MM-DD" },
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
    { col: "occupation",             note: "Job title / occupation — e.g. Site Supervisor, Electrician — leave blank to keep current" },
    { col: "passport_expiry",        note: "YYYY-MM-DD — leave blank to keep current date" },
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
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: C.sans,
      background: "#111111",
      padding: 24,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Red radial glow behind logo area */}
      <div style={{
        position: "absolute",
        top: "20%", left: "50%",
        transform: "translateX(-50%)",
        width: 480, height: 480,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(185,28,28,0.25) 0%, rgba(185,28,28,0.08) 45%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, position: "relative" }}>

        {/* Logo + brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <img src={appLogo} alt="DocGuard" style={{ width: 80, height: 80, objectFit: "contain", marginBottom: 16, filter: "drop-shadow(0 0 24px rgba(220,38,38,0.6))" }} />
          <div style={{ color: "#fff", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>DocGuard</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 4, letterSpacing: "0.04em" }}>Expatriate Compliance Management</div>
        </div>

        {/* Form card */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "36px 40px", width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
          backdropFilter: "blur(12px)",
        }}>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 600, marginBottom: 24, textAlign: "center" }}>Sign in to your account</div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...labelStyle, color: "rgba(255,255,255,0.6)", fontSize: 11 }}>USERNAME</label>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                required autoFocus
                placeholder="Enter your username"
                style={{
                  ...inputStyle(false),
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  borderRadius: 10,
                }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...labelStyle, color: "rgba(255,255,255,0.6)", fontSize: 11 }}>PASSWORD</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                style={{
                  ...inputStyle(false),
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  borderRadius: 10,
                }}
              />
            </div>
            {error && (
              <div style={{
                background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)", color: "#fca5a5",
                padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16, textAlign: "center",
              }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={{
              width: "100%", background: C.accent, color: "#fff",
              border: "none", padding: "13px 0", borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1, fontFamily: C.sans,
              boxShadow: "0 4px 20px rgba(220,38,38,0.4)",
              letterSpacing: "0.02em",
            }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        {/* Copyright */}
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 28, textAlign: "center", letterSpacing: "0.02em" }}>
          © {new Date().getFullYear()} DocGuard — Expatriate Compliance Management · blackposse
        </div>
      </div>
    </div>
  );
};

// ── Reports ────────────────────────────────────────────────
const DOC_STATUS_FIELDS = [
  { key: "passport_status",        expKey: "passport_expiry",        label: "Passport" },
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
        emp.insurance_status?.status || "—",
        emp.work_permit_fee_status?.status || "—",
        emp.medical_status?.status || "—",
      ]);
      rowIdx++;
    }
  }

  autoTable(doc, {
    startY: 40,
    head: [["#", "EMP ID", "Name", "Passport No.", "Nationality", "Job Title", "Passport", "Insurance", "WPF", "Medical"]],
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
  const ALL_FIELDS = ["Passport","Insurance","Work Permit Fee","Medical"];
  autoTable(doc, {
    startY: 28,
    head: [["Employer","Site","Emp ID","Full Name","Passport","Insurance","WPF","Medical","Missing"]],
    body: alerts.map(r => [
      r.employer_name, r.site_name, r.employee_number, r.full_name,
      ...ALL_FIELDS.map(f => r.missing_fields.includes(f) ? "MISSING" : "SET"),
      `${r.missing_fields.length}/4`,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold" },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index >= 4 && d.column.index <= 7) {
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

    const headers = ["Employer","Site","Emp ID","Full Name","Passport No.","Nationality","Job Title","Passport Status","Passport Expiry","Insurance Status","Insurance Expiry","WPF Status","WPF Expiry","Medical Status","Medical Expiry"];
    const rows = employees.map(emp => [
      emp.employer_name, emp.site_name, emp.employee_number, emp.full_name,
      emp.passport_number || "", emp.nationality || "", emp.job_title || "",
      emp.passport_status?.status || "", emp.passport_expiry || "",
      emp.insurance_status?.status || "", emp.insurance_expiry || "",
      emp.work_permit_fee_status?.status || "", emp.work_permit_fee_expiry || "",
      emp.medical_status?.status || "", emp.medical_expiry || "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [20,22,14,28,18,16,20,16,14,16,14,14,12,14,12].map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Employees");

  } else if (reportData.type === "expiry") {
    const headers = ["Employer","Site","Emp ID","Full Name","Document","Expiry Date","Days Remaining","Status"];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...reportData.alerts.map(a => [a.employer_name, a.site_name, a.employee_number, a.full_name, a.expiry_type, a.expiry_date, a.days_remaining, a.status])]);
    ws["!cols"] = [20,22,14,28,16,14,16,12].map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Expiry Alerts");

  } else if (reportData.type === "missing") {
    const headers = ["Employer","Site","Emp ID","Full Name","Passport","Insurance","Work Permit Fee","Medical","Missing Count"];
    const ALL_FIELDS = ["Passport","Insurance","Work Permit Fee","Medical"];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...reportData.alerts.map(r => [
      r.employer_name, r.site_name, r.employee_number, r.full_name,
      ...ALL_FIELDS.map(f => r.missing_fields.includes(f) ? "MISSING" : "SET"),
      `${r.missing_fields.length}/4`,
    ])]);
    ws["!cols"] = [20,20,14,28,10,12,16,10,14].map(w => ({ wch: w }));
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
  { value: "insurance",        label: "Insurance" },
  { value: "medical",          label: "Medical" },
  { value: "quota_slot",       label: "Quota Slot" },
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
                    {["Emp ID","Name","Passport No.","Nationality","Passport","Insurance","WPF","Medical"].map(h => (
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
    const ALL_FIELDS = ["Passport","Insurance","Work Permit Fee","Medical"];
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: "#f0f9ff" }}>
          <span style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: "#0891b2" }}>{alerts.length} employees with missing document information</span>
          <span style={{ fontFamily: C.sans, fontSize: 12, color: C.textSub, marginLeft: 12 }}>Sorted by number of missing fields (most incomplete first)</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Employer","Site","Emp ID","Name","Passport","Insurance","Work Permit Fee","Medical","Missing Count"].map(h => (
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
                  <span style={{ fontFamily: C.mono, fontWeight: 700, color: row.missing_fields.length === 4 ? "#dc2626" : row.missing_fields.length >= 3 ? "#c2410c" : "#a16207" }}>
                    {row.missing_fields.length}/4
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
          ? `${API}/employees/?employer_id=${employerId}&resigned=false`
          : `${API}/employees/?resigned=false`;
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
  const { data: auditStats, refetch: refetchAuditStats } = useFetch(`${API}/admin/audit-log-stats`);
  const [confirmWipe, setConfirmWipe]       = useState(false);
  const [loading, setLoading]               = useState(false);
  const [message, setMessage]               = useState(null); // { type: "success"|"error", text }
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult,  setRestoreResult]  = useState(null); // { ok: bool, text: string }
  const [archiving, setArchiving]           = useState(false);

  // Invoice branding state (persisted in localStorage)
  const [coName,    setCoName]    = useState(() => localStorage.getItem("inv_co_name")    || "");
  const [coAddress, setCoAddress] = useState(() => localStorage.getItem("inv_co_address") || "");
  const [coPhone,   setCoPhone]   = useState(() => localStorage.getItem("inv_co_phone")   || "");
  const [coEmail,   setCoEmail]   = useState(() => localStorage.getItem("inv_co_email")   || "");
  const [coReg,     setCoReg]     = useState(() => localStorage.getItem("inv_co_reg")     || "");
  const [coLogo,    setCoLogo]    = useState(() => localStorage.getItem("inv_co_logo")    || "");
  const [logoW,     setLogoW]     = useState(() => Number(localStorage.getItem("inv_logo_w"))  || 28);
  const [logoH,     setLogoH]     = useState(() => Number(localStorage.getItem("inv_logo_h"))  || 20);
  const [stamp,     setStamp]     = useState(() => localStorage.getItem("inv_stamp")      || "");
  const [stampW,    setStampW]    = useState(() => Number(localStorage.getItem("inv_stamp_w")) || 30);
  const [stampH,    setStampH]    = useState(() => Number(localStorage.getItem("inv_stamp_h")) || 30);
  const [sig,       setSig]       = useState(() => localStorage.getItem("inv_sig")        || "");
  const [brandSaved, setBrandSaved] = useState(false);

  const handleImgUpload = (key, setter) => e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { localStorage.setItem(key, ev.target.result); setter(ev.target.result); };
    reader.readAsDataURL(file);
  };
  const clearImg = (key, setter) => { localStorage.removeItem(key); setter(""); };
  const saveBranding = () => {
    localStorage.setItem("inv_co_name",    coName);
    localStorage.setItem("inv_co_address", coAddress);
    localStorage.setItem("inv_co_phone",   coPhone);
    localStorage.setItem("inv_co_email",   coEmail);
    localStorage.setItem("inv_co_reg",     coReg);
    localStorage.setItem("inv_logo_w",     String(logoW));
    localStorage.setItem("inv_logo_h",     String(logoH));
    localStorage.setItem("inv_stamp_w",    String(stampW));
    localStorage.setItem("inv_stamp_h",    String(stampH));
    setBrandSaved(true);
    setTimeout(() => setBrandSaved(false), 2500);
  };

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

  const handleDownloadBackup = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/backup/export`);
      if (!res.ok) { const d = await res.json(); showMsg("error", d.detail || "Export failed."); return; }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url; a.download = `docguard_backup_${ts}.json`;
      a.click(); URL.revokeObjectURL(url);
      showMsg("success", `Backup downloaded — ${data.employees?.length ?? 0} employees, ${data.employers?.length ?? 0} employers.`);
    } catch (e) { showMsg("error", e.message); }
    finally { setLoading(false); }
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.version || !parsed.employers) { showMsg("error", "Invalid backup file."); return; }
        setConfirmRestore(parsed);
      } catch { showMsg("error", "Could not parse backup file — make sure it is a valid JSON backup."); }
    };
    reader.readAsText(file);
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const res = await apiFetch(`${API}/backup/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmRestore),
      });
      const d = await res.json();
      if (!res.ok) {
        setRestoreResult({ ok: false, text: d.detail || "Restore failed." });
      } else {
        setRestoreResult({ ok: true, text: `Restore complete — ${d.employees} employees, ${d.employers} employers, ${d.users} users restored.` });
        refetchStats();
        setTimeout(() => { setConfirmRestore(null); setRestoreResult(null); }, 3000);
      }
    } catch (e) {
      setRestoreResult({ ok: false, text: e.message || "Network error — restore may have failed." });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleArchiveLogs = async () => {
    setArchiving(true);
    try {
      const res = await apiFetch(`${API}/admin/archive-audit-logs`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) showMsg("error", d.detail || "Archive failed.");
      else { showMsg("success", d.message); refetchAuditStats(); refetchStats(); }
    } catch (e) { showMsg("error", e.message); }
    finally { setArchiving(false); }
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

      {/* Invoice Branding */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.pageBg }}>
          <div style={{ color: C.text, fontFamily: C.sans, fontSize: 14, fontWeight: 700 }}>Invoice Branding</div>
          <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12, marginTop: 2 }}>Company details, logo, stamp and signature printed on every generated invoice</div>
        </div>
        <div style={{ padding: "22px" }}>

          {/* ── Company Details ── */}
          {(() => {
            const fld = { fontFamily: C.sans, fontSize: 13, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, outline: "none", width: "100%", boxSizing: "border-box" };
            const lbl = { display: "block", fontFamily: C.sans, fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 };
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: C.sans, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>Company Details</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Company Name</label>
                    <input value={coName} onChange={e => setCoName(e.target.value)} placeholder="e.g. Gulf Manpower Services LLC" style={fld} />
                  </div>
                  <div>
                    <label style={lbl}>Registration / License No.</label>
                    <input value={coReg} onChange={e => setCoReg(e.target.value)} placeholder="e.g. CR-2019-00451" style={fld} />
                  </div>
                  <div>
                    <label style={lbl}>Phone</label>
                    <input value={coPhone} onChange={e => setCoPhone(e.target.value)} placeholder="e.g. +960 330 1234" style={fld} />
                  </div>
                  <div>
                    <label style={lbl}>Email</label>
                    <input value={coEmail} onChange={e => setCoEmail(e.target.value)} placeholder="e.g. accounts@company.com" style={fld} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Address</label>
                  <textarea value={coAddress} onChange={e => setCoAddress(e.target.value)} rows={2}
                    placeholder="e.g. 4th Floor, Orchid Tower, Male', Maldives"
                    style={{ ...fld, resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={saveBranding} style={{ background: brandSaved ? "#16a34a" : C.accent, color: "#fff", border: "none", padding: "9px 28px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>
                    {brandSaved ? "Saved!" : "Save All"}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── Images ── */}
          <div style={{ fontFamily: C.sans, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>Images</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>

            {/* Logo */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: C.sans, fontSize: 12, fontWeight: 600, color: C.text }}>Company Logo</div>
                <div style={{ fontFamily: C.sans, fontSize: 11, color: C.textMuted, marginTop: 2 }}>Top-left of invoice</div>
              </div>
              <div style={{ padding: 14 }}>
                {coLogo
                  ? <img src={coLogo} alt="Logo" style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain", borderRadius: 6, border: `1px solid ${C.border}`, display: "block", marginBottom: 10 }} />
                  : <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", background: C.pageBg, borderRadius: 6, border: `1px dashed ${C.border}`, marginBottom: 10 }}><span style={{ fontFamily: C.sans, fontSize: 11, color: C.textMuted }}>No image</span></div>
                }
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  {[["Width (mm)", logoW, setLogoW, "inv_logo_w"], ["Height (mm)", logoH, setLogoH, "inv_logo_h"]].map(([lbl, val, set, k]) => (
                    <div key={k}>
                      <div style={{ fontFamily: C.sans, fontSize: 10, color: C.textSub, marginBottom: 3 }}>{lbl}</div>
                      <input type="number" value={val} min={5} max={80}
                        onChange={e => { set(Number(e.target.value)); localStorage.setItem(k, e.target.value); }}
                        style={{ width: "100%", fontFamily: C.sans, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, outline: "none", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, background: C.accent, color: "#fff", padding: "6px 0", borderRadius: 7, cursor: "pointer", textAlign: "center", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>
                    {coLogo ? "Replace" : "Upload"}
                    <input type="file" accept="image/*" onChange={handleImgUpload("inv_co_logo", setCoLogo)} style={{ display: "none" }} />
                  </label>
                  {coLogo && <button onClick={() => clearImg("inv_co_logo", setCoLogo)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Clear</button>}
                </div>
              </div>
            </div>

            {/* Stamp */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: C.sans, fontSize: 12, fontWeight: 600, color: C.text }}>Company Stamp</div>
                <div style={{ fontFamily: C.sans, fontSize: 11, color: C.textMuted, marginTop: 2 }}>Bottom-right of invoice</div>
              </div>
              <div style={{ padding: 14 }}>
                {stamp
                  ? <img src={stamp} alt="Stamp" style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain", borderRadius: 6, border: `1px solid ${C.border}`, display: "block", marginBottom: 10 }} />
                  : <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", background: C.pageBg, borderRadius: 6, border: `1px dashed ${C.border}`, marginBottom: 10 }}><span style={{ fontFamily: C.sans, fontSize: 11, color: C.textMuted }}>No image</span></div>
                }
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  {[["Width (mm)", stampW, setStampW, "inv_stamp_w"], ["Height (mm)", stampH, setStampH, "inv_stamp_h"]].map(([lbl, val, set, k]) => (
                    <div key={k}>
                      <div style={{ fontFamily: C.sans, fontSize: 10, color: C.textSub, marginBottom: 3 }}>{lbl}</div>
                      <input type="number" value={val} min={5} max={80}
                        onChange={e => { set(Number(e.target.value)); localStorage.setItem(k, e.target.value); }}
                        style={{ width: "100%", fontFamily: C.sans, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, outline: "none", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, background: C.accent, color: "#fff", padding: "6px 0", borderRadius: 7, cursor: "pointer", textAlign: "center", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>
                    {stamp ? "Replace" : "Upload"}
                    <input type="file" accept="image/*" onChange={handleImgUpload("inv_stamp", setStamp)} style={{ display: "none" }} />
                  </label>
                  {stamp && <button onClick={() => clearImg("inv_stamp", setStamp)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Clear</button>}
                </div>
              </div>
            </div>

            {/* Signature */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: C.sans, fontSize: 12, fontWeight: 600, color: C.text }}>Signature</div>
                <div style={{ fontFamily: C.sans, fontSize: 11, color: C.textMuted, marginTop: 2 }}>Bottom-left of invoice</div>
              </div>
              <div style={{ padding: 14 }}>
                {sig
                  ? <img src={sig} alt="Signature" style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain", borderRadius: 6, border: `1px solid ${C.border}`, display: "block", marginBottom: 10 }} />
                  : <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", background: C.pageBg, borderRadius: 6, border: `1px dashed ${C.border}`, marginBottom: 10 }}><span style={{ fontFamily: C.sans, fontSize: 11, color: C.textMuted }}>No image</span></div>
                }
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, background: C.accent, color: "#fff", padding: "6px 0", borderRadius: 7, cursor: "pointer", textAlign: "center", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>
                    {sig ? "Replace" : "Upload"}
                    <input type="file" accept="image/*" onChange={handleImgUpload("inv_sig", setSig)} style={{ display: "none" }} />
                  </label>
                  {sig && <button onClick={() => clearImg("inv_sig", setSig)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>Clear</button>}
                </div>
              </div>
            </div>

          </div>
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
              <div style={{ color: "#ef4444", fontFamily: C.sans, fontSize: 12, marginTop: 3, opacity: 0.8 }}>Permanently deletes all employers, sites, employees and audit logs. Take a backup first!</div>
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

      {/* ── Audit Log Archive ─────────────────────────── */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.pageBg }}>
          <div style={{ color: C.text, fontFamily: C.sans, fontSize: 14, fontWeight: 700 }}>Audit Log Archive</div>
          <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12, marginTop: 2 }}>Move audit logs older than 1 year to an archive table to keep the database lean</div>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
            {[
              { label: "Active Logs",    value: auditStats?.active,     accent: C.accent },
              { label: "Archivable (>1yr)", value: auditStats?.archivable, accent: "#f59e0b" },
              { label: "Archived",       value: auditStats?.archived,   accent: "#6b7280" },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", borderTop: `3px solid ${accent}` }}>
                <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: C.sans, marginBottom: 6 }}>{label}</div>
                <div style={{ color: C.text, fontSize: 26, fontWeight: 800, fontFamily: C.mono, lineHeight: 1 }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }}>
            <div>
              <div style={{ color: "#92400e", fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>Archive Old Logs</div>
              <div style={{ color: "#b45309", fontFamily: C.sans, fontSize: 12, marginTop: 3 }}>
                {auditStats?.archivable > 0
                  ? `${auditStats.archivable} logs older than 1 year will be moved to the archive table`
                  : "No logs older than 1 year — nothing to archive"}
              </div>
            </div>
            <button onClick={handleArchiveLogs} disabled={archiving || !auditStats?.archivable}
              style={{ flexShrink: 0, marginLeft: 20, background: auditStats?.archivable ? "#f59e0b" : "#e5e7eb",
                color: auditStats?.archivable ? "#fff" : C.textMuted, border: "none",
                padding: "8px 20px", borderRadius: 8,
                cursor: archiving || !auditStats?.archivable ? "not-allowed" : "pointer",
                fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>
              {archiving ? "Archiving…" : "Archive Now"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Backup & Restore ──────────────────────────── */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.pageBg }}>
          <div style={{ color: C.text, fontFamily: C.sans, fontSize: 14, fontWeight: 700 }}>Backup & Restore</div>
          <div style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 12, marginTop: 2 }}>Download a full snapshot of all data, or restore from a previous backup file</div>
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Download backup */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10 }}>
            <div>
              <div style={{ color: "#0369a1", fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>Download Backup</div>
              <div style={{ color: "#0284c7", fontFamily: C.sans, fontSize: 12, marginTop: 3, opacity: 0.85 }}>
                Exports all employers, sites, employees, quota slots, users and audit logs as a JSON file
              </div>
            </div>
            <button onClick={handleDownloadBackup} disabled={loading}
              style={{ flexShrink: 0, marginLeft: 20, background: "#0ea5e9", color: "#fff", border: "none",
                padding: "8px 20px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: C.sans, fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
              {loading ? "Exporting…" : "Download Backup"}
            </button>
          </div>

          {/* Restore from file */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }}>
            <div>
              <div style={{ color: "#92400e", fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>Restore from Backup</div>
              <div style={{ color: "#b45309", fontFamily: C.sans, fontSize: 12, marginTop: 3, opacity: 0.85 }}>
                Replaces all current data with the contents of a backup file. Admin only. Cannot be undone.
              </div>
            </div>
            <label style={{ flexShrink: 0, marginLeft: 20 }}>
              <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleRestoreFile} />
              <span style={{ display: "inline-block", background: "#f59e0b", color: "#fff", border: "none",
                padding: "8px 20px", borderRadius: 8, cursor: "pointer",
                fontFamily: C.sans, fontSize: 13, fontWeight: 600 }}>
                Choose File…
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Restore Confirmation Modal ─────────────────── */}
      {confirmRestore && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: C.cardBg, borderRadius: 14, padding: "28px 30px", width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: C.sans, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Restore from Backup?</div>
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.textSub, marginBottom: 16 }}>
              This will <strong>replace all current data</strong> with the backup exported on{" "}
              <strong>{confirmRestore.exported_at?.slice(0,10) || "unknown date"}</strong>.
            </div>
            <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                ["Employers",   confirmRestore.employers?.length   ?? 0],
                ["Sites",       confirmRestore.sites?.length       ?? 0],
                ["Employees",   confirmRestore.employees?.length   ?? 0],
                ["Quota Slots", confirmRestore.quota_slots?.length ?? 0],
                ["Users",       confirmRestore.users?.length       ?? 0],
                ["Audit Logs",  confirmRestore.audit_logs?.length  ?? 0],
              ].map(([label, count]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 800, color: C.text }}>{count}</div>
                  <div style={{ fontFamily: C.sans, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                </div>
              ))}
            </div>
            {restoreResult && (
              <div style={{
                marginBottom: 16, padding: "12px 14px", borderRadius: 8,
                background: restoreResult.ok ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${restoreResult.ok ? "#bbf7d0" : "#fecaca"}`,
                color: restoreResult.ok ? "#16a34a" : "#dc2626",
                fontFamily: C.sans, fontSize: 13, fontWeight: 500,
              }}>
                {restoreResult.ok ? "✓" : "⚠"} {restoreResult.text}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setConfirmRestore(null); setRestoreResult(null); }} disabled={restoreLoading}
                style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.textSub, fontFamily: C.sans, fontSize: 13, cursor: "pointer" }}>
                {restoreResult?.ok ? "Close" : "Cancel"}
              </button>
              {!restoreResult?.ok && (
                <button onClick={handleRestore} disabled={restoreLoading}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#f59e0b", color: "#fff", fontFamily: C.sans, fontSize: 13, fontWeight: 700, cursor: restoreLoading ? "not-allowed" : "pointer", opacity: restoreLoading ? 0.7 : 1 }}>
                  {restoreLoading ? "Restoring…" : "Yes, Restore Now"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Invoice Tab ────────────────────────────────────────────
const InvoiceTab = ({ isAdmin }) => {
  const { data: employers } = useFetch(`${API}/employers/`);
  const [employerId, setEmployerId]           = useState("");
  const [employees, setEmployees]             = useState([]);
  const [loadingEmps, setLoadingEmps]         = useState(false);
  const [invoiceType, setInvoiceType]         = useState("wpf");    // "wpf" | "insurance" | "quota" | "combined"
  const [combineWpf, setCombineWpf]           = useState(true);
  const [combineInsurance, setCombineInsurance] = useState(true);
  const [combineQuota, setCombineQuota]       = useState(true);
  const [rate, setRate]                       = useState(350);
  const [months, setMonths]                   = useState(3);
  const [quotaMode, setQuotaMode]             = useState("annual"); // "annual" | "monthly"
  const [quotaMonths, setQuotaMonths]         = useState(1);
  const [quotaFirstMonth, setQuotaFirstMonth] = useState(true);
  const [includeAgencyFee, setIncludeAgencyFee] = useState(false);
  const [agencyFee, setAgencyFee]             = useState("");
  const [invoiceNumber, setInvoiceNumber]     = useState("INV-……");
  const [invoiceDate, setInvoiceDate]         = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes]                     = useState("");
  const [selectedIds, setSelectedIds]         = useState(new Set());
  const [search, setSearch]                   = useState("");
  const [history, setHistory]                 = useState([]);
  const [histLoading, setHistLoading]         = useState(false);
  const [invoiceSubTab, setInvoiceSubTab]     = useState("generate");
  const [histSearch, setHistSearch]           = useState("");
  const [histStatus, setHistStatus]           = useState("all");
  const [histType, setHistType]               = useState("all");
  const [histPage, setHistPage]               = useState(1);
  const HIST_PER_PAGE = 15;
  const [markPaidConfirm, setMarkPaidConfirm] = useState(null);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [markPaidError, setMarkPaidError]     = useState(null);

  // Load invoice history from server and fetch next invoice number
  const loadHistory = () => {
    setHistLoading(true);
    apiFetch(`${API}/invoices/`)
      .then(r => r.json())
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistLoading(false));
  };
  const loadNextNumber = () => {
    apiFetch(`${API}/invoices/next-number`)
      .then(r => r.json())
      .then(d => { if (d.number) setInvoiceNumber(d.number); })
      .catch(() => {});
  };
  useEffect(() => { loadHistory(); loadNextNumber(); }, []);

  useEffect(() => {
    if (!employerId) { setEmployees([]); setSelectedIds(new Set()); setSearch(""); return; }
    setLoadingEmps(true);
    apiFetch(`${API}/employees/`)
      .then(r => r.json())
      .then(data => {
        const filtered = (Array.isArray(data) ? data : [])
          .filter(e => String(e.employer_id) === String(employerId) && !e.resigned);
        setEmployees(filtered);
        setSelectedIds(new Set());
      })
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmps(false));
  }, [employerId]);

  const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

  function monthsOverdue(expiryStr) {
    const exp = new Date(expiryStr); exp.setHours(0,0,0,0);
    if (exp >= todayMs) return 0;
    let m = (todayMs.getFullYear() - exp.getFullYear()) * 12 + (todayMs.getMonth() - exp.getMonth());
    if (todayMs.getDate() < exp.getDate()) m = Math.max(0, m - 1);
    return m;
  }

  function fmtDate(d) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${String(d.getDate()).padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function coveragePeriod(expiryStr, numMonths) {
    const start = new Date(expiryStr);
    const end   = new Date(expiryStr);
    end.setMonth(end.getMonth() + numMonths);
    return `${fmtDate(start)} - ${fmtDate(end)}`;
  }

  const visibleEmployees = employees.filter(e =>
    !search.trim() || e.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const allVisibleSelected = visibleEmployees.length > 0 && visibleEmployees.every(e => selectedIds.has(e.id));

  const toggleAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleEmployees.forEach(e => next.delete(e.id));
      else visibleEmployees.forEach(e => next.add(e.id));
      return next;
    });
  };
  const toggleOne = id => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selectedEmployees   = employees.filter(e => selectedIds.has(e.id));
  const selectedEmployer    = (employers || []).find(e => String(e.id) === String(employerId));
  const quotaPerEmp = (() => {
    if (quotaMode === "annual") return 2000;
    if (quotaMonths <= 0) return 0;
    return quotaFirstMonth ? (174 + (quotaMonths - 1) * 166) : (quotaMonths * 166);
  })();
  const perEmp = (() => {
    if (invoiceType === "wpf")       return months * rate;
    if (invoiceType === "insurance") return 800;
    if (invoiceType === "quota")     return quotaPerEmp;
    if (invoiceType === "combined")  return (combineWpf ? months * rate : 0) + (combineInsurance ? 800 : 0) + (combineQuota ? quotaPerEmp : 0);
    return 0;
  })();
  const subtotal     = selectedEmployees.length * perEmp;
  const agencyFeeAmt = includeAgencyFee ? (parseFloat(agencyFee) || 0) : 0;
  const grandTotal   = subtotal + agencyFeeAmt;

  // ── Shared PDF builder (used by both generate and replay) ──
  const buildPDFDoc = (ctx) => {
    const {
      invNumber, invDate, employerName, invoiceType: iType,
      emps, cfg, cwpf, cins, cquota, notesText, gtotal,
    } = ctx;
    const { months: mo, rate: rt, quotaMode: qMode, quotaMonths: qMo,
            quotaFirstMonth: qFirst, includeAgencyFee: incAF, agencyFeeAmt: afAmt } = cfg;

    const qPerEmp = qMode === "annual" ? 2000
      : qFirst ? (174 + (qMo - 1) * 166) : (qMo * 166);
    const pPerEmp = iType === "wpf" ? mo * rt
      : iType === "insurance" ? 800
      : iType === "quota" ? qPerEmp
      : (cwpf ? mo * rt : 0) + (cins ? 800 : 0) + (cquota ? qPerEmp : 0);
    const n = emps.length;
    const subtotal = n * pPerEmp;

    function fmtD(d) {
      const ms = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${String(d.getDate()).padStart(2,"0")} ${ms[d.getMonth()]} ${d.getFullYear()}`;
    }
    function covPeriod(expiryStr, numMonths) {
      const s = new Date(expiryStr), e = new Date(expiryStr);
      e.setMonth(e.getMonth() + numMonths);
      return `${fmtD(s)} - ${fmtD(e)}`;
    }

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 18;

    // Read branding from localStorage
    const coName    = localStorage.getItem("inv_co_name")    || "";
    const coAddress = localStorage.getItem("inv_co_address") || "";
    const coPhone   = localStorage.getItem("inv_co_phone")   || "";
    const coEmail   = localStorage.getItem("inv_co_email")   || "";
    const coReg     = localStorage.getItem("inv_co_reg")     || "";
    const coLogo    = localStorage.getItem("inv_co_logo")    || "";
    const logoW     = Number(localStorage.getItem("inv_logo_w"))  || 28;
    const logoH     = Number(localStorage.getItem("inv_logo_h"))  || 20;
    const stamp     = localStorage.getItem("inv_stamp")      || "";
    const stampW    = Number(localStorage.getItem("inv_stamp_w")) || 30;
    const stampH    = Number(localStorage.getItem("inv_stamp_h")) || 30;
    const sig       = localStorage.getItem("inv_sig")        || "";

    // ── Header area ──────────────────────────────────────
    let y = M;

    if (coLogo) {
      try {
        const fmt = coLogo.includes("png") ? "PNG" : "JPEG";
        doc.addImage(coLogo, fmt, M, y, logoW, logoH);
      } catch {}
    }

    const infoX = coLogo ? M + logoW + 4 : M;
    let infoY = y + 4;
    if (coName) {
      doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
      doc.text(coName, infoX, infoY); infoY += 6;
    }
    doc.setFontSize(7.5); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    if (coAddress) { doc.text(coAddress, infoX, infoY); infoY += 5; }
    const contactLine = [coPhone, coEmail].filter(Boolean).join("   |   ");
    if (contactLine) { doc.text(contactLine, infoX, infoY); infoY += 5; }
    if (coReg) { doc.text(`Reg: ${coReg}`, infoX, infoY); infoY += 5; }

    doc.setFontSize(26); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
    doc.text("INVOICE", W - M, y + 8, { align: "right" });

    const metaY = y + 16;
    doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text("Invoice No.", W - M - 42, metaY);
    doc.text("Date",        W - M - 42, metaY + 6);
    doc.text("Currency",    W - M - 42, metaY + 12);
    doc.setTextColor(15,23,42); doc.setFont("helvetica","bold");
    doc.text(invNumber, W - M, metaY,      { align: "right" });
    doc.text(invDate,   W - M, metaY + 6,  { align: "right" });
    doc.text("MVR",         W - M, metaY + 12, { align: "right" });

    y = Math.max(infoY + 4, metaY + 18);

    doc.setDrawColor(226,232,240); doc.setLineWidth(0.4);
    doc.line(M, y, W - M, y); y += 8;

    // ── Bill To ──────────────────────────────────────────
    doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
    doc.text("BILL TO", M, y); y += 5;
    doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
    doc.text(employerName || "—", M, y); y += 6;
    doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    if (iType === "wpf") {
      doc.text(`Rate: MVR ${Number(rt).toFixed(2)} / employee / month   |   Coverage: ${mo} month${mo>1?"s":""} from each employee's WPF expiry date`, M, y);
    } else if (iType === "insurance") {
      doc.text("Annual insurance fee: MVR 800.00 per employee", M, y);
    } else if (iType === "combined") {
      const parts = [cwpf && "WPF", cins && "Insurance", cquota && "Quota Slot"].filter(Boolean);
      doc.text(`Combined invoice — ${parts.join(" + ")}   |   ${n} employee${n !== 1 ? "s" : ""}`, M, y);
    } else if (qMode === "annual") {
      doc.text("Annual quota slot fee: MVR 2,000.00 per slot", M, y);
    } else {
      const modeDesc = qFirst
        ? `1st month MVR 174.00${qMo > 1 ? ` + ${qMo - 1} x MVR 166.00` : ""}`
        : `${qMo} x MVR 166.00`;
      doc.text(`Monthly quota slot fee: ${qMo} month${qMo>1?"s":""} (${modeDesc})`, M, y);
    }
    y += 10;

    // ── Employee table(s) ─────────────────────────────────
    // Total printable width = 174mm (210 - 18 - 18)
    // Combined sub-table columns: # (10) | Name (100) | Middle (40) | Amount (24) = 174
    const subTableStyles = { fontSize: 8, cellPadding: 3 };
    const subHeadStyles  = { fillColor: [15,23,42], textColor: 255, fontStyle: "bold", fontSize: 8 };
    const subAltStyles   = { fillColor: [248,250,252] };
    const drawSectionLabel = (label) => {
      doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
      doc.text(label, M, y); y += 4;
    };

    let tableHead, tableBody, colStyles;

    if (iType === "wpf") {
      tableHead = [["#", "Employee Name", "WP Number", "WPF Expiry", "Coverage Period", "Mo.", "Amount (MVR)"]];
      tableBody = emps.map((emp, i) => [
        String(i + 1), emp.full_name, emp.work_permit_number || "—",
        emp.work_permit_fee_expiry || "—",
        emp.work_permit_fee_expiry ? covPeriod(emp.work_permit_fee_expiry, mo) : "—",
        String(mo), (mo * rt).toFixed(2),
      ]);
      colStyles = {
        0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 40 }, 2: { cellWidth: 24 },
        3: { cellWidth: 22, halign: "center" }, 4: { cellWidth: 50 },
        5: { cellWidth: 10, halign: "center" }, 6: { cellWidth: 18, halign: "right", fontStyle: "bold" },
      };
    } else if (iType === "insurance") {
      tableHead = [["#", "Employee Name", "WP Number", "Insurance Expiry", "Coverage Period", "Amount (MVR)"]];
      tableBody = emps.map((emp, i) => [
        String(i + 1), emp.full_name, emp.work_permit_number || "—",
        emp.insurance_expiry || "—",
        emp.insurance_expiry ? covPeriod(emp.insurance_expiry, 12) : "—",
        (800).toFixed(2),
      ]);
      colStyles = {
        0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 42 }, 2: { cellWidth: 26 },
        3: { cellWidth: 26, halign: "center" }, 4: { cellWidth: 52 },
        5: { cellWidth: 18, halign: "right", fontStyle: "bold" },
      };
    } else {
      const modeLabel = qMode === "annual" ? "Annual" : `${qMo} mo.${qFirst ? " (1st incl.)" : ""}`;
      tableHead = [["#", "Employee Name", "WP Number", "Quota Slot No.", "Payment Mode", "Amount (MVR)"]];
      tableBody = emps.map((emp, i) => [
        String(i + 1), emp.full_name, emp.work_permit_number || "—",
        emp.quota_slot_number || "—", modeLabel, pPerEmp.toFixed(2),
      ]);
      colStyles = {
        0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 44 }, 2: { cellWidth: 26 },
        3: { cellWidth: 30 }, 4: { cellWidth: 46 },
        5: { cellWidth: 18, halign: "right", fontStyle: "bold" },
      };
    }

    if (iType === "combined") {
      let secIndex = 0;
      const sections = [cwpf && "wpf", cins && "insurance", cquota && "quota"].filter(Boolean);
      for (const sec of sections) {
        secIndex++;
        const letter = String.fromCharCode(64 + secIndex);
        if (sec === "wpf") {
          drawSectionLabel(`SECTION ${letter}  —  WORK PERMIT FEE`);
          autoTable(doc, {
            startY: y,
            head: [["#", "Employee Name", "WPF Expiry", "Mo.", "Amount (MVR)"]],
            body: emps.map((emp, i) => [String(i+1), emp.full_name, emp.work_permit_fee_expiry||"—", String(mo), (mo*rt).toFixed(2)]),
            styles: subTableStyles, headStyles: subHeadStyles, alternateRowStyles: subAltStyles,
            columnStyles: { 0:{cellWidth:10,halign:"center"},1:{cellWidth:100},2:{cellWidth:26,halign:"center"},3:{cellWidth:14,halign:"center"},4:{cellWidth:24,halign:"right",fontStyle:"bold"} },
            margin: { left: M, right: M },
          });
        } else if (sec === "insurance") {
          drawSectionLabel(`SECTION ${letter}  —  INSURANCE`);
          autoTable(doc, {
            startY: y,
            head: [["#", "Employee Name", "Insurance Expiry", "Amount (MVR)"]],
            body: emps.map((emp, i) => [String(i+1), emp.full_name, emp.insurance_expiry||"—", (800).toFixed(2)]),
            styles: subTableStyles, headStyles: subHeadStyles, alternateRowStyles: subAltStyles,
            columnStyles: { 0:{cellWidth:10,halign:"center"},1:{cellWidth:120},2:{cellWidth:26,halign:"center"},3:{cellWidth:18,halign:"right",fontStyle:"bold"} },
            margin: { left: M, right: M },
          });
        } else {
          drawSectionLabel(`SECTION ${letter}  —  QUOTA SLOT FEE`);
          autoTable(doc, {
            startY: y,
            head: [["#", "Employee Name", "Quota Slot No.", "Mode", "Amount (MVR)"]],
            body: emps.map((emp, i) => [String(i+1), emp.full_name, emp.quota_slot_number||"—", qMode==="annual"?"Annual":`${qMo}mo${qFirst?" (1st incl.)":""}`, qPerEmp.toFixed(2)]),
            styles: subTableStyles, headStyles: subHeadStyles, alternateRowStyles: subAltStyles,
            columnStyles: { 0:{cellWidth:10,halign:"center"},1:{cellWidth:86},2:{cellWidth:30},3:{cellWidth:30},4:{cellWidth:18,halign:"right",fontStyle:"bold"} },
            margin: { left: M, right: M },
          });
        }
        y = doc.lastAutoTable.finalY + (secIndex < sections.length ? 6 : 8);
      }
    } else {
      autoTable(doc, {
        startY: y, head: tableHead, body: tableBody,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold", fontSize: 8 },
        columnStyles: colStyles, alternateRowStyles: { fillColor: [248,250,252] },
        margin: { left: M, right: M },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // ── Totals ───────────────────────────────────────────
    const tX = W - M - 80, tW = 80;
    const drawRow = (label, value, bg, textCol, bold, h) => {
      doc.setFillColor(...bg); doc.rect(tX, y, tW, h, "F");
      doc.setFontSize(bold ? 9.5 : 8.5); doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(...textCol);
      doc.text(label, tX + 4, y + h * 0.62);
      doc.text(value, W - M - 2, y + h * 0.62, { align: "right" });
      y += h + 1;
    };

    if (iType === "combined") {
      if (cwpf)  drawRow(`WPF: ${n} emp x ${mo}mo x MVR ${rt}`, `MVR ${(n*mo*rt).toFixed(2)}`, [248,250,252],[15,23,42],false,8);
      if (cins)  drawRow(`Insurance: ${n} emp x MVR 800`, `MVR ${(n*800).toFixed(2)}`, [248,250,252],[15,23,42],false,8);
      if (cquota) drawRow(`Quota: ${n} x MVR ${qPerEmp.toFixed(2)}`, `MVR ${(n*qPerEmp).toFixed(2)}`, [248,250,252],[15,23,42],false,8);
    } else {
      let subtotalLabel;
      if (iType === "wpf") subtotalLabel = `WPF: ${n} emp x ${mo} mo x MVR ${rt}`;
      else if (iType === "insurance") subtotalLabel = `Insurance: ${n} emp x MVR 800`;
      else if (qMode === "annual") subtotalLabel = `Quota Slots: ${n} x MVR 2,000`;
      else subtotalLabel = `Quota Slots: ${n} x MVR ${pPerEmp.toFixed(2)} (${qMo} mo)`;
      drawRow(subtotalLabel, `MVR ${subtotal.toFixed(2)}`, [248,250,252],[15,23,42],false,8);
    }
    if (incAF && afAmt > 0)
      drawRow("Agency Fee", `MVR ${afAmt.toFixed(2)}`, [248,250,252],[15,23,42],false,8);
    drawRow("TOTAL DUE", `MVR ${gtotal.toFixed(2)}`, [15,23,42],[255,255,255],true,11);
    y += 8;

    // ── Signature & Stamp ────────────────────────────────
    const sigStampY = y;
    const sigImgW = 52, sigImgH = 20;
    if (sig) {
      try { doc.addImage(sig, sig.includes("png")?"PNG":"JPEG", M, sigStampY, sigImgW, sigImgH); } catch {}
      doc.setDrawColor(100,116,139); doc.setLineWidth(0.3);
      doc.line(M, sigStampY+sigImgH+1, M+sigImgW, sigStampY+sigImgH+1);
      doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
      doc.text("Authorized Signature", M, sigStampY+sigImgH+5);
    }
    if (stamp) {
      try { doc.addImage(stamp, stamp.includes("png")?"PNG":"JPEG", W-M-stampW, sigStampY, stampW, stampH); } catch {}
      doc.setDrawColor(100,116,139); doc.setLineWidth(0.3);
      doc.line(W-M-stampW, sigStampY+Math.max(sigImgH,stampH)+1, W-M, sigStampY+Math.max(sigImgH,stampH)+1);
      doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
      doc.text("Company Stamp", W-M-stampW, sigStampY+Math.max(sigImgH,stampH)+5);
    }
    y = (sig||stamp) ? sigStampY+Math.max(sig?sigImgH:0,stamp?stampH:0)+12 : sigStampY;

    // ── Notes ────────────────────────────────────────────
    if (notesText?.trim()) {
      doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.line(M,y,W-M,y); y+=6;
      doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
      doc.text("NOTES", M, y); y+=4;
      doc.setFont("helvetica","normal"); doc.setTextColor(15,23,42); doc.setFontSize(8);
      doc.text(doc.splitTextToSize(notesText, W-2*M), M, y);
    }

    // ── Footer ───────────────────────────────────────────
    doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.line(M, 283, W-M, 283);
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184);
    doc.text("Generated by DocGuard — Expatriate Compliance Management System", W/2, 288, { align: "center" });

    return { doc, filename: `Invoice_${invNumber}_${(employerName||"employer").replace(/\s+/g,"_")}.pdf` };
  };

  const generatePDF = async () => {
    const empSnap = selectedEmployees.map(e => ({
      id: e.id, full_name: e.full_name,
      work_permit_number: e.work_permit_number,
      work_permit_fee_expiry: e.work_permit_fee_expiry,
      insurance_expiry: e.insurance_expiry,
      quota_slot_id: e.quota_slot_id,
      quota_slot_number: e.quota_slot_number,
      quota_slot_expiry: e.quota_slot_expiry,
    }));
    const afAmt = includeAgencyFee ? (parseFloat(agencyFee) || 0) : 0;
    const ctx = {
      invNumber: invoiceNumber, invDate: invoiceDate,
      employerName: selectedEmployer?.name || "—",
      invoiceType, emps: empSnap,
      cfg: { months, rate, quotaMode, quotaMonths, quotaFirstMonth, includeAgencyFee, agencyFeeAmt: afAmt },
      cwpf: combineWpf, cins: combineInsurance, cquota: combineQuota,
      notesText: notes, gtotal: grandTotal,
    };
    const { doc, filename } = buildPDFDoc(ctx);
    doc.save(filename);

    // Save to server
    try {
      const res = await apiFetch(`${API}/invoices/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: invoiceNumber, date: invoiceDate,
          employerName: selectedEmployer?.name || "—",
          invoiceType, employeeCount: selectedIds.size,
          grandTotal,
          combineWpf, combineInsurance, combineQuota,
          notes, employees: empSnap,
          config: { months, rate, quotaMode, quotaMonths, quotaFirstMonth, includeAgencyFee, agencyFeeAmt: afAmt },
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setHistory(prev => [saved, ...prev]);
      }
    } catch {}

    // Get next invoice number from server
    loadNextNumber();
  };

  const replayPDF = (record) => {
    const cfg = record.config || { months: 1, rate: 350, quotaMode: "annual", quotaMonths: 1, quotaFirstMonth: true, includeAgencyFee: false, agencyFeeAmt: 0 };
    const { doc, filename } = buildPDFDoc({
      invNumber: record.number, invDate: record.date,
      employerName: record.employerName,
      invoiceType: record.invoiceType,
      emps: record.employees || [],
      cfg,
      cwpf: record.combineWpf, cins: record.combineInsurance, cquota: record.combineQuota,
      notesText: record.notes || "",
      gtotal: record.grandTotal,
    });
    doc.save(filename);
  };

  const handleMarkPaid = async (inv) => {
    if (inv.status === "paid") {
      // Toggle back to pending — no expiry changes needed
      try {
        const res = await apiFetch(`${API}/invoices/${inv.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "pending" }),
        });
        if (res.ok) {
          const updated = await res.json();
          setHistory(prev => prev.map(r => r.id === inv.id ? updated : r));
        }
      } catch {}
      return;
    }
    setMarkPaidError(null);
    setMarkPaidConfirm(inv);
  };

  const confirmMarkPaid = async (updateExpiries) => {
    const inv = markPaidConfirm;
    if (!inv) return;
    setMarkPaidLoading(true); setMarkPaidError(null);
    try {
      if (updateExpiries && inv.employees?.length) {
        const needsWpf      = inv.invoiceType === "wpf"       || (inv.invoiceType === "combined" && inv.combineWpf);
        const needsInsurance = inv.invoiceType === "insurance" || (inv.invoiceType === "combined" && inv.combineInsurance);
        const needsQuota    = inv.invoiceType === "quota"      || (inv.invoiceType === "combined" && inv.combineQuota);
        const cfg = inv.config || {};
        const errors = [];

        for (const emp of inv.employees) {
          const payload = {};
          const today = new Date();

          if (needsWpf) {
            const base = emp.work_permit_fee_expiry && new Date(emp.work_permit_fee_expiry) > today
              ? new Date(emp.work_permit_fee_expiry) : new Date(inv.date);
            base.setMonth(base.getMonth() + (cfg.months || 1));
            payload.work_permit_fee_expiry = base.toISOString().split("T")[0];
          }
          if (needsInsurance) {
            const base = emp.insurance_expiry && new Date(emp.insurance_expiry) > today
              ? new Date(emp.insurance_expiry) : new Date(inv.date);
            base.setFullYear(base.getFullYear() + 1);
            payload.insurance_expiry = base.toISOString().split("T")[0];
          }

          if (Object.keys(payload).length > 0) {
            try {
              const res = await apiFetch(`${API}/employees/${emp.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                errors.push(`${emp.full_name}: ${d.detail?.message || d.detail || "update failed"}`);
              }
            } catch (e) { errors.push(`${emp.full_name}: ${e.message}`); }
          }

          if (needsQuota && emp.quota_slot_id) {
            const base = emp.quota_slot_expiry && new Date(emp.quota_slot_expiry) > today
              ? new Date(emp.quota_slot_expiry) : new Date(inv.date);
            if (cfg.quotaMode === "annual") base.setFullYear(base.getFullYear() + 1);
            else base.setMonth(base.getMonth() + (cfg.quotaMonths || 1));
            try {
              const res = await apiFetch(`${API}/quota-slots/${emp.quota_slot_id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expiry_date: base.toISOString().split("T")[0] }),
              });
              if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                errors.push(`${emp.full_name} (quota): ${d.detail?.message || d.detail || "update failed"}`);
              }
            } catch (e) { errors.push(`${emp.full_name} (quota): ${e.message}`); }
          }
        }

        if (errors.length > 0) {
          setMarkPaidError(errors.join("\n"));
          setMarkPaidLoading(false);
          return;
        }
      }

      const res = await apiFetch(`${API}/invoices/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setHistory(prev => prev.map(r => r.id === inv.id ? updated : r));
      }
      setMarkPaidConfirm(null);
    } catch (e) {
      setMarkPaidError(e.message);
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const inSt = { fontFamily: C.sans, fontSize: 13, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, outline: "none" };
  const lbSt = { fontFamily: C.sans, fontSize: 11, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* ── Sub-tab toggle ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[["generate","New Invoice"],["history","History"]].map(([key, label]) => (
          <button key={key} onClick={() => setInvoiceSubTab(key)} style={{
            fontFamily: C.sans, fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 7,
            border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
            background: invoiceSubTab === key ? C.accent : "transparent",
            color: invoiceSubTab === key ? "#fff" : C.textSub,
          }}>
            {label}
            {key === "history" && history.length > 0 && (
              <span style={{ background: invoiceSubTab === "history" ? "rgba(255,255,255,0.3)" : C.accent, color: "#fff", borderRadius: 8, padding: "0 6px", fontSize: 10, fontWeight: 700, lineHeight: "16px" }}>
                {history.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ NEW INVOICE ══ */}
      {invoiceSubTab === "generate" && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* Left column: config + totals/generate */}
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Config card */}
            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Configure Invoice</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={lbSt}>Employer</label>
                  <select value={employerId} onChange={e => setEmployerId(e.target.value)} style={{ ...inSt, width: "100%", boxSizing: "border-box" }}>
                    <option value="">— Select Employer —</option>
                    {(employers || []).map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbSt}>Invoice Type</label>
                  <select value={invoiceType} onChange={e => { setInvoiceType(e.target.value); setSelectedIds(new Set()); }} style={{ ...inSt, width: "100%", boxSizing: "border-box" }}>
                    <option value="wpf">Work Permit Fee</option>
                    <option value="insurance">Insurance</option>
                    <option value="quota">Quota Slot Fee</option>
                    <option value="combined">Combined (All Types)</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbSt}>Invoice No.</label>
                    <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={{ ...inSt, width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbSt}>Date</label>
                    <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={{ ...inSt, width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
                {invoiceType === "wpf" && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbSt}>Rate / Month</label>
                      <input type="number" value={rate} onChange={e => setRate(Number(e.target.value))} min={1} style={{ ...inSt, width: "100%", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbSt}>Months</label>
                      <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ ...inSt, width: "100%", boxSizing: "border-box" }}>
                        {[1,2,3,4,5,6,9,12].map(m => <option key={m} value={m}>{m} mo</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {invoiceType === "quota" && <>
                  <div>
                    <label style={lbSt}>Payment Mode</label>
                    <select value={quotaMode} onChange={e => setQuotaMode(e.target.value)} style={{ ...inSt, width: "100%", boxSizing: "border-box" }}>
                      <option value="annual">Annual (MVR 2,000)</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  {quotaMode === "monthly" && (
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <label style={lbSt}>Months</label>
                        <select value={quotaMonths} onChange={e => setQuotaMonths(Number(e.target.value))} style={{ ...inSt, width: "100%", boxSizing: "border-box" }}>
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m} month{m>1?"s":""}</option>)}
                        </select>
                      </div>
                      <div style={{ paddingBottom: 9 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12, color: C.text, userSelect: "none", whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={quotaFirstMonth} onChange={e => setQuotaFirstMonth(e.target.checked)} style={{ width: 15, height: 15, accentColor: C.accent }} />
                          1st month (174)
                        </label>
                      </div>
                    </div>
                  )}
                </>}
                {invoiceType === "combined" && (
                  <div style={{ background: C.pageBg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Include Fee Types</div>
                    {[
                      ["wpf", "Work Permit Fee", combineWpf, setCombineWpf],
                      ["insurance", "Insurance (MVR 800/yr)", combineInsurance, setCombineInsurance],
                      ["quota", "Quota Slot Fee", combineQuota, setCombineQuota],
                    ].map(([key, label, checked, setter]) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, color: C.text, userSelect: "none", marginBottom: 8 }}>
                        <input type="checkbox" checked={checked} onChange={e => setter(e.target.checked)} style={{ width: 15, height: 15, accentColor: C.accent }} />
                        {label}
                      </label>
                    ))}
                    {combineWpf && (
                      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ ...lbSt, marginBottom: 4 }}>WPF Rate / Mo.</label>
                          <input type="number" value={rate} onChange={e => setRate(Number(e.target.value))} min={1} style={{ ...inSt, width: "100%", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ ...lbSt, marginBottom: 4 }}>Months</label>
                          <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ ...inSt, width: "100%", boxSizing: "border-box" }}>
                            {[1,2,3,4,5,6,9,12].map(m => <option key={m} value={m}>{m} mo</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    {combineQuota && (
                      <div style={{ marginTop: 6 }}>
                        <label style={{ ...lbSt, marginBottom: 4 }}>Quota Mode</label>
                        <select value={quotaMode} onChange={e => setQuotaMode(e.target.value)} style={{ ...inSt, width: "100%", boxSizing: "border-box", marginBottom: 8 }}>
                          <option value="annual">Annual (MVR 2,000)</option>
                          <option value="monthly">Monthly</option>
                        </select>
                        {quotaMode === "monthly" && (
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ ...lbSt, marginBottom: 4 }}>Months</label>
                              <select value={quotaMonths} onChange={e => setQuotaMonths(Number(e.target.value))} style={{ ...inSt, width: "100%", boxSizing: "border-box" }}>
                                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m} month{m>1?"s":""}</option>)}
                              </select>
                            </div>
                            <div style={{ paddingBottom: 9 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12, color: C.text, userSelect: "none", whiteSpace: "nowrap" }}>
                                <input type="checkbox" checked={quotaFirstMonth} onChange={e => setQuotaFirstMonth(e.target.checked)} style={{ width: 15, height: 15, accentColor: C.accent }} />
                                1st month (174)
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 13, color: C.text, userSelect: "none", marginBottom: includeAgencyFee ? 8 : 0 }}>
                    <input type="checkbox" checked={includeAgencyFee} onChange={e => setIncludeAgencyFee(e.target.checked)} style={{ width: 15, height: 15, accentColor: C.accent }} />
                    Include Agency Fee
                  </label>
                  {includeAgencyFee && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: C.sans, fontSize: 13, color: C.textSub }}>MVR</span>
                      <input type="number" value={agencyFee} onChange={e => setAgencyFee(e.target.value)} placeholder="0.00" min={0} style={{ ...inSt, flex: 1 }} />
                    </div>
                  )}
                </div>
                <div>
                  <label style={lbSt}>Notes (optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Payment due within 30 days…"
                    rows={2} style={{ ...inSt, width: "100%", resize: "vertical", boxSizing: "border-box" }} />
                </div>
              </div>
            </div>

            {/* Totals + Generate (appears once employees are selected) */}
            {selectedIds.size > 0 && (
              <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <div style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                  Summary — {selectedIds.size} employee{selectedIds.size !== 1 ? "s" : ""}
                </div>
                <div style={{ marginBottom: 14 }}>
                  {[
                    ...(invoiceType === "wpf"
                      ? [["Rate", `MVR ${Number(rate).toFixed(2)} / mo`], ["Months", `${months}`]]
                      : invoiceType === "insurance"
                      ? [["Rate", "MVR 800.00 / yr"]]
                      : invoiceType === "quota"
                      ? (quotaMode === "annual" ? [["Rate", "MVR 2,000 / yr"]] : [["Months", `${quotaMonths}`], ["Per Slot", `MVR ${quotaPerEmp.toFixed(2)}`]])
                      : [
                          ...(combineWpf       ? [["WPF", `${selectedIds.size} x MVR ${(months * rate).toFixed(2)}`]] : []),
                          ...(combineInsurance ? [["Insurance", `${selectedIds.size} x MVR 800.00`]] : []),
                          ...(combineQuota     ? [["Quota", `${selectedIds.size} x MVR ${quotaPerEmp.toFixed(2)}`]] : []),
                        ]),
                    ["Subtotal", `MVR ${subtotal.toFixed(2)}`],
                    ...(includeAgencyFee ? [["Agency Fee", `MVR ${agencyFeeAmt.toFixed(2)}`]] : []),
                  ].map(([lbl, val]) => (
                    <div key={lbl} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.borderLight}`, fontFamily: C.sans, fontSize: 12 }}>
                      <span style={{ color: C.textSub }}>{lbl}</span>
                      <span style={{ fontFamily: C.mono, color: C.text }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", marginTop: 6, borderTop: `2px solid ${C.border}`, fontFamily: C.sans, fontSize: 15, fontWeight: 700 }}>
                    <span style={{ color: C.text }}>Total Due</span>
                    <span style={{ fontFamily: C.mono, color: C.accent }}>MVR {grandTotal.toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={generatePDF} style={{
                  width: "100%", background: C.accent, color: "#fff",
                  border: "none", padding: "11px 0", borderRadius: 9,
                  cursor: "pointer", fontFamily: C.sans, fontSize: 14, fontWeight: 700,
                  boxShadow: `0 4px 14px ${C.accent}40`,
                }}>
                  ↓ Generate PDF Invoice
                </button>
              </div>
            )}
          </div>{/* end left column */}

          {/* Right column: employee selection */}
          {employerId ? (
            <div style={{ flex: 1, minWidth: 0, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: C.pageBg, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: C.text }}>
                    {loadingEmps ? "Loading…" : `${employees.length} employee${employees.length !== 1 ? "s" : ""}`}
                  </span>
                  {!loadingEmps && employees.length > 0 && (
                    <span style={{ fontFamily: C.sans, fontSize: 12, color: C.textSub, marginLeft: 10 }}>{selectedIds.size} selected</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {employees.length > 0 && (
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                      style={{ ...inSt, padding: "5px 10px", fontSize: 12, width: 160 }} />
                  )}
                  {visibleEmployees.length > 0 && (
                    <button onClick={toggleAll} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textSub, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12, whiteSpace: "nowrap" }}>
                      {allVisibleSelected ? "Deselect All" : "Select All"}
                    </button>
                  )}
                </div>
              </div>
              {!loadingEmps && employees.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: C.textMuted, fontFamily: C.sans, fontSize: 13 }}>No employees found for this employer.</div>
              )}
              {!loadingEmps && employees.length > 0 && visibleEmployees.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: C.textMuted, fontFamily: C.sans, fontSize: 13 }}>No employees match "{search}".</div>
              )}
              {visibleEmployees.length > 0 && (
                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 230px)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "10px 14px", width: 40, borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} style={{ accentColor: C.accent, cursor: "pointer" }} />
                        </th>
                        {(invoiceType === "wpf"
                          ? ["Employee","WP Number","WPF Expiry","Status","Overdue","Coverage Period","Months","Amount (MVR)"]
                          : invoiceType === "insurance"
                          ? ["Employee","WP Number","Insurance Expiry","Coverage Period","Amount (MVR)"]
                          : invoiceType === "quota"
                          ? ["Employee","WP Number","Quota Slot No.","Amount (MVR)"]
                          : ["Employee","WP Number",...(combineWpf?["WPF (MVR)"]:[]),...(combineInsurance?["Insurance (MVR)"]:[]),...(combineQuota?["Quota (MVR)"]:[]),"Total (MVR)"]
                        ).map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: C.textSub, fontSize: 10, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEmployees.map(emp => {
                        const isSelected   = selectedIds.has(emp.id);
                        const hasWpfExpiry = !!emp.work_permit_fee_expiry;
                        const overdue      = hasWpfExpiry ? monthsOverdue(emp.work_permit_fee_expiry) : null;
                        const status       = emp.work_permit_fee_status?.status;
                        const cfg          = STATUS_CONFIG[status];
                        return (
                          <tr key={emp.id} onClick={() => toggleOne(emp.id)}
                            style={{ borderBottom: `1px solid ${C.borderLight}`, background: isSelected ? "#f0f9ff" : "transparent", cursor: "pointer" }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.rowHover; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "#f0f9ff" : "transparent"; }}>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleOne(emp.id)}
                                onClick={e => e.stopPropagation()} style={{ accentColor: C.accent, cursor: "pointer" }} />
                            </td>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>{emp.full_name}</td>
                            <td style={{ padding: "10px 12px", color: C.textSub, fontFamily: C.mono, fontSize: 11 }}>{emp.work_permit_number || "—"}</td>
                            {invoiceType === "wpf" && <>
                              <td style={{ padding: "10px 12px", fontFamily: C.mono, fontSize: 11, color: C.textSub }}>{emp.work_permit_fee_expiry || <span style={{ color: C.textMuted }}>—</span>}</td>
                              <td style={{ padding: "10px 12px" }}>
                                {status ? <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, background: cfg?.bg || "#f8fafc", color: cfg?.color || C.textMuted, fontWeight: 600, fontSize: 10 }}>{cfg?.label || status}</span> : <span style={{ color: C.textMuted }}>—</span>}
                              </td>
                              <td style={{ padding: "10px 12px", fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: overdue > 0 ? "#b91c1c" : "#16a34a" }}>
                                {overdue === null ? <span style={{ color: C.textMuted }}>—</span> : overdue > 0 ? `${overdue} mo` : "Current"}
                              </td>
                              <td style={{ padding: "10px 12px", color: C.textSub, fontSize: 11, whiteSpace: "nowrap" }}>
                                {hasWpfExpiry ? coveragePeriod(emp.work_permit_fee_expiry, months) : <span style={{ color: C.textMuted }}>—</span>}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: C.mono, color: C.textSub }}>{months}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: C.mono, fontWeight: 700, color: C.text }}>{(months * rate).toFixed(2)}</td>
                            </>}
                            {invoiceType === "insurance" && <>
                              <td style={{ padding: "10px 12px", fontFamily: C.mono, fontSize: 11, color: C.textSub }}>{emp.insurance_expiry || <span style={{ color: C.textMuted }}>—</span>}</td>
                              <td style={{ padding: "10px 12px", color: C.textSub, fontSize: 11, whiteSpace: "nowrap" }}>
                                {emp.insurance_expiry ? coveragePeriod(emp.insurance_expiry, 12) : <span style={{ color: C.textMuted }}>—</span>}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: C.mono, fontWeight: 700, color: C.text }}>800.00</td>
                            </>}
                            {invoiceType === "quota" && <>
                              <td style={{ padding: "10px 12px", fontFamily: C.mono, fontSize: 11, color: C.textSub }}>{emp.quota_slot_number || <span style={{ color: C.textMuted }}>—</span>}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: C.mono, fontWeight: 700, color: C.text }}>{perEmp.toFixed(2)}</td>
                            </>}
                            {invoiceType === "combined" && <>
                              {combineWpf       && <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: C.mono, color: C.textSub }}>{(months * rate).toFixed(2)}</td>}
                              {combineInsurance && <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: C.mono, color: C.textSub }}>800.00</td>}
                              {combineQuota     && <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: C.mono, color: C.textSub }}>{quotaPerEmp.toFixed(2)}</td>}
                              <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: C.mono, fontWeight: 700, color: C.text }}>{perEmp.toFixed(2)}</td>
                            </>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <span style={{ color: C.textMuted, fontFamily: C.sans, fontSize: 13 }}>Select an employer to load employees</span>
            </div>
          )}
        </div>
      )}{/* end generate tab */}

      {/* ══ HISTORY TAB ══ */}
      {invoiceSubTab === "history" && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.pageBg, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input value={histSearch} onChange={e => { setHistSearch(e.target.value); setHistPage(1); }}
              placeholder="Search by invoice no. or employer…"
              style={{ ...inSt, padding: "6px 12px", fontSize: 12, width: 260 }} />
            <select value={histStatus} onChange={e => { setHistStatus(e.target.value); setHistPage(1); }} style={{ ...inSt, fontSize: 12, padding: "6px 10px" }}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
            <select value={histType} onChange={e => { setHistType(e.target.value); setHistPage(1); }} style={{ ...inSt, fontSize: 12, padding: "6px 10px" }}>
              <option value="all">All Types</option>
              <option value="wpf">Work Permit Fee</option>
              <option value="insurance">Insurance</option>
              <option value="quota">Quota Slot</option>
              <option value="combined">Combined</option>
            </select>
            {isAdmin && (
              <button onClick={async () => {
                if (window.confirm("Clear all invoice history?")) {
                  await apiFetch(`${API}/invoices/`, { method: "DELETE" });
                  setHistory([]);
                }
              }} style={{ marginLeft: "auto", background: "none", border: `1px solid #fca5a5`, color: "#b91c1c", padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>
                Clear All
              </button>
            )}
          </div>
          {histLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: C.textMuted, fontFamily: C.sans, fontSize: 13 }}>Loading invoice history…</div>
          ) : null}
          {!histLoading && (() => {
            const filtered = history.filter(inv => {
              const q = histSearch.toLowerCase();
              const matchQ = !q || inv.number?.toLowerCase().includes(q) || inv.employerName?.toLowerCase().includes(q);
              const matchS = histStatus === "all" || inv.status === histStatus;
              const matchT = histType === "all" || inv.invoiceType === histType;
              return matchQ && matchS && matchT;
            });
            const totalPages = Math.max(1, Math.ceil(filtered.length / HIST_PER_PAGE));
            const page = Math.min(histPage, totalPages);
            const pageItems = filtered.slice((page - 1) * HIST_PER_PAGE, page * HIST_PER_PAGE);
            if (filtered.length === 0) return (
              <div style={{ padding: 40, textAlign: "center", color: C.textMuted, fontFamily: C.sans, fontSize: 13 }}>
                {history.length === 0 ? "No invoices generated yet." : "No results match your filters."}
              </div>
            );
            return (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Invoice No.","Date","Employer","Type","Employees","Total (MVR)","Status","Actions"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: C.textSub, fontSize: 10, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map(inv => (
                        <tr key={inv.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                          <td style={{ padding: "10px 14px", fontFamily: C.mono, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{inv.number}</td>
                          <td style={{ padding: "10px 14px", color: C.textSub, whiteSpace: "nowrap" }}>{inv.date}</td>
                          <td style={{ padding: "10px 14px", color: C.text, fontWeight: 500 }}>{inv.employerName}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                              background: inv.invoiceType === "wpf" ? "#eff6ff" : inv.invoiceType === "insurance" ? "#f0fdf4" : inv.invoiceType === "quota" ? "#faf5ff" : "#fff7ed",
                              color:      inv.invoiceType === "wpf" ? "#1d4ed8" : inv.invoiceType === "insurance" ? "#15803d"  : inv.invoiceType === "quota" ? "#7e22ce" : "#c2410c",
                            }}>
                              {inv.invoiceType === "wpf" ? "WPF" : inv.invoiceType === "insurance" ? "Insurance" : inv.invoiceType === "quota" ? "Quota" : "Combined"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", fontFamily: C.mono, color: C.textSub }}>{inv.employeeCount}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: C.mono, fontWeight: 700, color: C.text }}>{Number(inv.grandTotal).toFixed(2)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                              background: inv.status === "paid" ? "#dcfce7" : "#fef3c7",
                              color:      inv.status === "paid" ? "#15803d" : "#92400e",
                            }}>
                              {inv.status === "paid" ? "Paid" : "Pending"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => replayPDF(inv)}
                                style={{ background: "none", border: `1px solid ${C.border}`, color: C.accent, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: C.sans, fontSize: 11, whiteSpace: "nowrap" }}>
                                View
                              </button>
                              <button onClick={() => handleMarkPaid(inv)}
                                style={{ background: "none", border: `1px solid ${C.border}`, color: C.textSub, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: C.sans, fontSize: 11, whiteSpace: "nowrap" }}>
                                Mark {inv.status === "paid" ? "Pending" : "Paid"}
                              </button>
                              <button onClick={async () => {
                                if (window.confirm(`Delete invoice ${inv.number}?`)) {
                                  await apiFetch(`${API}/invoices/${inv.id}`, { method: "DELETE" });
                                  setHistory(prev => prev.filter(r => r.id !== inv.id));
                                }
                              }} style={{ background: "none", border: `1px solid #fca5a5`, color: "#b91c1c", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: C.sans, fontSize: 11, whiteSpace: "nowrap" }}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: C.sans, fontSize: 12, color: C.textSub }}>
                    <span>{filtered.length} record{filtered.length !== 1 ? "s" : ""} — page {page} of {totalPages}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setHistPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "none", cursor: page === 1 ? "default" : "pointer", color: page === 1 ? C.textMuted : C.text, fontFamily: C.sans, fontSize: 12 }}>Prev</button>
                      <button onClick={() => setHistPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "none", cursor: page === totalPages ? "default" : "pointer", color: page === totalPages ? C.textMuted : C.text, fontFamily: C.sans, fontSize: 12 }}>Next</button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}{/* end history tab */}

      {/* ══ MARK PAID MODAL ══ */}
      {markPaidConfirm && (() => {
        const inv = markPaidConfirm;
        const cfg = inv.config || {};
        const needsWpf      = inv.invoiceType === "wpf"       || (inv.invoiceType === "combined" && inv.combineWpf);
        const needsInsurance = inv.invoiceType === "insurance" || (inv.invoiceType === "combined" && inv.combineInsurance);
        const needsQuota    = inv.invoiceType === "quota"      || (inv.invoiceType === "combined" && inv.combineQuota);
        const hasEmpData    = inv.employees?.length > 0;
        const today = new Date();

        const calcWpfExpiry = (emp) => {
          const base = emp.work_permit_fee_expiry && new Date(emp.work_permit_fee_expiry) > today
            ? new Date(emp.work_permit_fee_expiry) : new Date(inv.date);
          base.setMonth(base.getMonth() + (cfg.months || 1));
          return base.toISOString().split("T")[0];
        };
        const calcInsExpiry = (emp) => {
          const base = emp.insurance_expiry && new Date(emp.insurance_expiry) > today
            ? new Date(emp.insurance_expiry) : new Date(inv.date);
          base.setFullYear(base.getFullYear() + 1);
          return base.toISOString().split("T")[0];
        };
        const calcQuotaExpiry = (emp) => {
          const base = emp.quota_slot_expiry && new Date(emp.quota_slot_expiry) > today
            ? new Date(emp.quota_slot_expiry) : new Date(inv.date);
          if (cfg.quotaMode === "annual") base.setFullYear(base.getFullYear() + 1);
          else base.setMonth(base.getMonth() + (cfg.quotaMonths || 1));
          return base.toISOString().split("T")[0];
        };

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: C.cardBg, borderRadius: 14, padding: "28px 30px", width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.sans, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Mark Invoice as Paid</div>
              <div style={{ fontFamily: C.sans, fontSize: 12, color: C.textSub, marginBottom: 20 }}>{inv.number} · {inv.employerName}</div>

              {hasEmpData && (needsWpf || needsInsurance || needsQuota) ? (
                <>
                  <div style={{ fontFamily: C.sans, fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                    The following expiry dates will be updated:
                  </div>
                  <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: C.sans }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          <th style={{ padding: "8px 12px", textAlign: "left", color: C.textSub, fontWeight: 600 }}>Employee</th>
                          {needsWpf       && <th style={{ padding: "8px 12px", textAlign: "center", color: C.textSub, fontWeight: 600 }}>WPF Expiry →</th>}
                          {needsInsurance && <th style={{ padding: "8px 12px", textAlign: "center", color: C.textSub, fontWeight: 600 }}>Insurance →</th>}
                          {needsQuota     && <th style={{ padding: "8px 12px", textAlign: "center", color: C.textSub, fontWeight: 600 }}>Quota →</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {inv.employees.map(emp => (
                          <tr key={emp.id} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                            <td style={{ padding: "7px 12px", color: C.text, fontWeight: 500 }}>{emp.full_name}</td>
                            {needsWpf       && <td style={{ padding: "7px 12px", textAlign: "center", fontFamily: C.mono, color: "#15803d", fontWeight: 600 }}>{calcWpfExpiry(emp)}</td>}
                            {needsInsurance && <td style={{ padding: "7px 12px", textAlign: "center", fontFamily: C.mono, color: "#15803d", fontWeight: 600 }}>{calcInsExpiry(emp)}</td>}
                            {needsQuota     && <td style={{ padding: "7px 12px", textAlign: "center", fontFamily: C.mono, color: emp.quota_slot_id ? "#15803d" : C.textMuted, fontWeight: 600 }}>{emp.quota_slot_id ? calcQuotaExpiry(emp) : "no slot"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {markPaidError && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontFamily: C.sans, fontSize: 11, color: "#b91c1c", whiteSpace: "pre-wrap" }}>{markPaidError}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => { setMarkPaidConfirm(null); setMarkPaidError(null); }}
                      disabled={markPaidLoading}
                      style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.textSub, fontFamily: C.sans, fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={() => confirmMarkPaid(false)}
                      disabled={markPaidLoading}
                      style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.text, fontFamily: C.sans, fontSize: 12, cursor: "pointer" }}>
                      Mark Paid Only
                    </button>
                    <button onClick={() => confirmMarkPaid(true)}
                      disabled={markPaidLoading}
                      style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontFamily: C.sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {markPaidLoading ? "Updating…" : "Mark Paid + Update Expiries"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: C.sans, fontSize: 13, color: C.textSub, marginBottom: 20 }}>
                    {!hasEmpData ? "No employee data saved with this invoice (older record). This will only update the payment status." : "No expiry fields apply to this invoice type."}
                  </div>
                  {markPaidError && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontFamily: C.sans, fontSize: 11, color: "#b91c1c" }}>{markPaidError}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => { setMarkPaidConfirm(null); setMarkPaidError(null); }}
                      style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.textSub, fontFamily: C.sans, fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={() => confirmMarkPaid(false)}
                      disabled={markPaidLoading}
                      style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontFamily: C.sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {markPaidLoading ? "Updating…" : "Mark Paid"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
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
            <img src={appLogo} alt="Logo" style={{ width: 40, height: 40, objectFit: "contain" }} />
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                DocGuard
                {false && urgentTotal > 0 && (
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
        <Tabs tabs={["OVERVIEW", "ALERTS", "EMPLOYEES", "EMPLOYERS", "REPORTS", "INVOICES"]} active={tab} onChange={setTab} />
        <div key={tab} style={{ animation: "slideTab 0.18s ease" }}>
          {tab === "OVERVIEW"  && <DashboardTab onNavigate={handleDashNav} />}
          {tab === "ALERTS"    && <AlertsTab key={alertNavKey} initialView={alertNav.view} initialFilter={alertNav.filter} initialDays={alertNav.days} />}
          {tab === "EMPLOYEES" && <EmployeesTab />}
          {tab === "EMPLOYERS" && <EmployersTab />}
          {tab === "REPORTS"   && <ReportsTab />}
          {tab === "INVOICES"  && <InvoiceTab isAdmin={!!currentUser?.is_admin} />}
        </div>
      </div>
    </div>
  );
}
