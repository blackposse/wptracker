import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8001";

const C = {
  bg:           "#f8fafc",
  pageBg:       "#f1f5f9",
  cardBg:       "#ffffff",
  border:       "#e2e8f0",
  borderLight:  "#f1f5f9",
  text:         "#0f172a",
  textSub:      "#475569",
  textMuted:    "#94a3b8",
  accent:       "#dc2626",
  accentBg:     "rgba(220, 38, 38, 0.07)",
  accentBorder: "rgba(220, 38, 38, 0.25)",
  tabActiveBg:  "#fff5f5",
  rowHover:     "#f8fafc",
  inputBg:      "#f8fafc",
};

const STATUS_CONFIG = {
  Valid:    { color: "#16a34a", bg: "#f0fdf4", label: "VALID",     icon: "✓" },
  Warning:  { color: "#d97706", bg: "#fffbeb", label: "WARNING",   icon: "⚠" },
  Critical: { color: "#dc2626", bg: "#fef2f2", label: "EXPIRING",  icon: "!" },
  Expired:  { color: "#9ca3af", bg: "#f3f4f6", label: "EXPIRED",   icon: "✗" },
};

function daysColor(days) {
  if (days < 0)  return "#9ca3af";
  if (days < 15) return "#dc2626";
  if (days < 30) return "#f97316";
  if (days < 60) return "#d97706";
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

// ── Date helpers ──────────────────────────────────────────
function addDays(fromDateStr, days) {
  const base = fromDateStr ? new Date(fromDateStr) : new Date();
  if (base < new Date()) { base.setTime(new Date().getTime()); }
  base.setDate(base.getDate() + days);
  return base.toISOString().split("T")[0];
}
function addYears(fromDateStr, years) {
  return addDays(fromDateStr, years * 365);
}

// ── Format datetime for history display ───────────────────
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
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [url]);
  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
};

const Badge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Valid;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}40`,
      padding: "2px 8px", borderRadius: 3,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      fontFamily: "monospace", whiteSpace: "nowrap",
    }}>{cfg.icon} {cfg.label}</span>
  );
};

const StatCard = ({ label, value, sub, accent, glow }) => (
  <div style={{
    background: C.cardBg, border: `1px solid ${glow && value > 0 ? `${accent}60` : C.border}`,
    padding: "20px 24px", borderRadius: 8,
    borderLeft: `3px solid ${accent || C.border}`,
    flex: 1, minWidth: 160,
    boxShadow: glow && value > 0
      ? `0 0 0 1px ${accent}20, 0 4px 16px ${accent}18`
      : "0 1px 3px rgba(0,0,0,0.06)",
    transition: "box-shadow 0.3s",
  }}>
    <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.12em", fontFamily: "monospace", marginBottom: 8 }}>{label}</div>
    <div style={{ color: glow && value > 0 ? accent : C.text, fontSize: 32, fontWeight: 800, lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>{value ?? "—"}</div>
    {sub && <div style={{ color: C.textMuted, fontSize: 11, marginTop: 6 }}>{sub}</div>}
  </div>
);

const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
    {tabs.map(t => (
      <button key={t} onClick={() => onChange(t)} style={{
        background: active === t ? C.tabActiveBg : "transparent",
        color: active === t ? C.accent : C.textMuted,
        border: "none",
        borderBottom: active === t ? `2px solid ${C.accent}` : "2px solid transparent",
        padding: "10px 20px", cursor: "pointer",
        fontFamily: "'DM Mono', monospace", fontSize: 12,
        letterSpacing: "0.08em", fontWeight: active === t ? 700 : 400,
        transition: "all 0.15s",
      }}>{t}</button>
    ))}
  </div>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    backdropFilter: "blur(2px)",
  }} onClick={onClose}>
    <div style={{
      background: C.cardBg, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 32,
      minWidth: wide ? 640 : 480, maxWidth: wide ? 720 : 560,
      maxHeight: "90vh", overflowY: "auto",
      boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
    }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h3 style={{ color: C.text, margin: 0, fontSize: 16, fontFamily: "monospace" }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 20, cursor: "pointer" }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const InputRow = ({ label, name, type = "text", value, onChange, required, readOnly }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: "block", color: C.textSub, fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>
      {label}{required && <span style={{ color: C.accent }}> *</span>}
    </label>
    <input type={type} name={name} value={value} onChange={onChange} required={required} readOnly={readOnly}
      style={{
        width: "100%", background: readOnly ? C.pageBg : C.inputBg,
        border: `1px solid ${C.border}`,
        color: readOnly ? C.textSub : C.text,
        padding: "8px 12px", borderRadius: 4,
        fontFamily: "monospace", fontSize: 13, boxSizing: "border-box", outline: "none",
        cursor: readOnly ? "default" : "text",
      }} />
  </div>
);

const SelectRow = ({ label, name, value, onChange, options, required }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: "block", color: C.textSub, fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>
      {label}{required && <span style={{ color: C.accent }}> *</span>}
    </label>
    <select name={name} value={value} onChange={onChange} required={required}
      style={{
        width: "100%", background: C.inputBg, border: `1px solid ${C.border}`,
        color: C.text, padding: "8px 12px", borderRadius: 4,
        fontFamily: "monospace", fontSize: 13, boxSizing: "border-box",
      }}>
      <option value="">— Select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// ── Date field with auto-calculate button ─────────────────
const DateFieldWithCalc = ({ label, name, value, onChange, calcLabel, onCalc, required }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: "block", color: C.textSub, fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>
      {label}{required && <span style={{ color: C.accent }}> *</span>}
    </label>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="date" name={name} value={value} onChange={onChange}
        style={{
          flex: 1, background: C.inputBg, border: `1px solid ${C.border}`,
          color: C.text, padding: "8px 12px", borderRadius: 4,
          fontFamily: "monospace", fontSize: 13, boxSizing: "border-box", outline: "none",
        }} />
      {calcLabel && (
        <button type="button" onClick={onCalc} style={{
          background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBorder}`,
          padding: "7px 10px", borderRadius: 4, cursor: "pointer",
          fontFamily: "monospace", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
        }}>{calcLabel}</button>
      )}
    </div>
  </div>
);

// ── Employee Detail / Edit Modal ──────────────────────────────────
const EmployeeDetailModal = ({ emp, sites, employers, onClose, onUpdated, onDeleted }) => {
  const [mode, setMode] = useState("VIEW"); // VIEW | EDIT | HISTORY
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    full_name:              emp.full_name || "",
    nationality:            emp.nationality || "",
    job_title:              emp.job_title || "",
    passport_expiry:        emp.passport_expiry || "",
    visa_stamp_expiry:      emp.visa_stamp_expiry || "",
    insurance_expiry:       emp.insurance_expiry || "",
    work_permit_fee_expiry: emp.work_permit_fee_expiry || "",
    note:                   "",
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleModeChange = async (newMode) => {
    setMode(newMode);
    if (newMode === "HISTORY" && logs === null) {
      setLogsLoading(true);
      try {
        const res = await fetch(`${API}/employees/${emp.id}/logs`);
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
    try {
      const payload = { ...form };
      // strip empty strings for date fields
      ["passport_expiry","visa_stamp_expiry","insurance_expiry","work_permit_fee_expiry"].forEach(f => {
        if (payload[f] === "") payload[f] = null;
      });
      if (!payload.note) delete payload.note;
      const res = await fetch(`${API}/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail?.message || data.detail || "Error updating employee");
      } else {
        onUpdated(data);
        setMode("VIEW");
        setLogs(null); // reset so history reloads
      }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    const res = await fetch(`${API}/employees/${emp.id}`, { method: "DELETE" });
    if (res.ok) { onDeleted(emp.id); }
    else { const d = await res.json().catch(() => ({})); setError(d.detail || "Error deleting employee"); }
  };

  const employerName = (employers || []).find(e => e.id === emp.employer_id)?.name || `Employer #${emp.employer_id}`;
  const siteName     = (sites || []).find(s => s.id === emp.site_id)?.site_name || `Site #${emp.site_id}`;

  const docRows = [
    { label: "PASSPORT",        name: "passport_expiry",        status: emp.passport_status },
    { label: "VISA STAMP",      name: "visa_stamp_expiry",      status: emp.visa_stamp_status },
    { label: "INSURANCE",       name: "insurance_expiry",       status: emp.insurance_status },
    { label: "WORK PERMIT FEE", name: "work_permit_fee_expiry", status: emp.work_permit_fee_status },
  ];

  const modalTitle = mode === "EDIT"
    ? `EDITING — ${emp.full_name}`
    : mode === "HISTORY"
    ? `HISTORY — ${emp.full_name}`
    : emp.full_name;

  return (
    <Modal wide title={modalTitle} onClose={onClose}>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {/* Mode tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {["VIEW", "EDIT", "HISTORY"].map(m => (
          <button key={m} onClick={() => handleModeChange(m)} style={{
            background: mode === m ? C.tabActiveBg : "transparent",
            color: mode === m ? C.accent : C.textMuted,
            border: "none",
            borderBottom: mode === m ? `2px solid ${C.accent}` : "2px solid transparent",
            padding: "7px 18px", cursor: "pointer",
            fontFamily: "monospace", fontSize: 11, letterSpacing: "0.08em",
            fontWeight: mode === m ? 700 : 400,
          }}>{m}</button>
        ))}
      </div>

      {mode === "VIEW" && (
        <div>
          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px", marginBottom: 20 }}>
            {[
              ["EMP NO.",    emp.employee_number],
              ["EMPLOYER",   employerName],
              ["SITE",       siteName],
              ["NATIONALITY",emp.nationality || "—"],
              ["JOB TITLE",  emp.job_title || "—"],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ marginBottom: 12 }}>
                <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: 2 }}>{lbl}</div>
                <div style={{ color: C.text, fontFamily: "monospace", fontSize: 13 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Document status cards */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 20 }}>
            <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: 12 }}>DOCUMENT STATUS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {docRows.map(({ label, name, status }) => {
                const cfg = STATUS_CONFIG[status?.status] || null;
                return (
                  <div key={name} style={{
                    background: cfg ? cfg.bg : C.pageBg,
                    border: `1px solid ${cfg ? `${cfg.color}30` : C.border}`,
                    borderRadius: 6, padding: "10px 14px",
                    borderLeft: `3px solid ${cfg ? cfg.color : C.border}`,
                  }}>
                    <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: C.text, fontFamily: "monospace", fontSize: 12, flex: 1 }}>
                        {status?.date || "Not set"}
                      </span>
                      {status?.status && <Badge status={status.status} />}
                    </div>
                    {status?.days_remaining !== undefined && status?.days_remaining !== null && (
                      <div style={{ color: cfg?.color || C.textMuted, fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>
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

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} style={{ background: "none", color: "#dc2626", border: "1px solid #fecaca", padding: "7px 16px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>
                DELETE EMPLOYEE
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>Are you sure?</span>
                <button onClick={handleDelete} style={{ background: "#dc2626", color: "#fff", border: "none", padding: "7px 16px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>YES, DELETE</button>
                <button onClick={() => setConfirmDelete(false)} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "7px 14px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>CANCEL</button>
              </div>
            )}
            <button onClick={() => handleModeChange("EDIT")} style={{ background: C.accent, color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
              EDIT
            </button>
          </div>
        </div>
      )}

      {mode === "EDIT" && (
        <div>
          {/* Read-only context */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px", marginBottom: 4 }}>
            <InputRow label="EMP NO." name="_empno" value={emp.employee_number} onChange={() => {}} readOnly />
            <InputRow label="EMPLOYER" name="_employer" value={employerName} onChange={() => {}} readOnly />
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 14 }} />

          {/* Editable fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <InputRow label="FULL NAME" name="full_name" value={form.full_name} onChange={handleChange} required />
            {/* Nationality dropdown */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", color: C.textSub, fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>NATIONALITY</label>
              <select name="nationality" value={form.nationality} onChange={handleChange}
                style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, padding: "8px 12px", borderRadius: 4, fontFamily: "monospace", fontSize: 13, boxSizing: "border-box" }}>
                <option value="">— Select —</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <InputRow label="JOB TITLE" name="job_title" value={form.job_title} onChange={handleChange} />
            <div /> {/* spacer */}
            {/* Passport — date only, no auto-calc */}
            <InputRow label="PASSPORT EXPIRY" name="passport_expiry" type="date" value={form.passport_expiry} onChange={handleChange} />
            {/* Visa Stamp — +1 YEAR */}
            <DateFieldWithCalc
              label="VISA STAMP EXPIRY" name="visa_stamp_expiry" value={form.visa_stamp_expiry}
              onChange={handleChange} calcLabel="+ 1 YEAR"
              onCalc={() => setForm(f => ({ ...f, visa_stamp_expiry: addYears(f.visa_stamp_expiry, 1) }))}
            />
            {/* Insurance — +1 YEAR */}
            <DateFieldWithCalc
              label="INSURANCE EXPIRY" name="insurance_expiry" value={form.insurance_expiry}
              onChange={handleChange} calcLabel="+ 1 YEAR"
              onCalc={() => setForm(f => ({ ...f, insurance_expiry: addYears(f.insurance_expiry, 1) }))}
            />
            {/* Work Permit Fee — +30 DAYS */}
            <DateFieldWithCalc
              label="WORK PERMIT FEE EXPIRY" name="work_permit_fee_expiry" value={form.work_permit_fee_expiry}
              onChange={handleChange} calcLabel="+ 30 DAYS"
              onCalc={() => setForm(f => ({ ...f, work_permit_fee_expiry: addDays(f.work_permit_fee_expiry, 30) }))}
            />
          </div>

          {/* Note field */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", color: C.textSub, fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>NOTE (optional — saved to audit log)</label>
            <input type="text" name="note" value={form.note} onChange={handleChange}
              placeholder="e.g. Renewed at immigration office"
              style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, padding: "8px 12px", borderRadius: 4, fontFamily: "monospace", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setMode("VIEW"); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12 }}>
              CANCEL
            </button>
            <button onClick={handleSave} disabled={saving} style={{ background: C.accent, color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
              {saving ? "SAVING..." : "SAVE CHANGES"}
            </button>
          </div>
        </div>
      )}

      {mode === "HISTORY" && (
        <div>
          {logsLoading ? (
            <div style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 12, padding: "24px 0", textAlign: "center" }}>LOADING HISTORY...</div>
          ) : logs && logs.length === 0 ? (
            <div style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 12, padding: "24px 0", textAlign: "center" }}>No history recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(logs || []).map((log, i) => (
                <div key={log.id || i} style={{
                  background: C.pageBg, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: "10px 14px",
                  borderLeft: `3px solid ${C.accent}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <span style={{ color: C.accent, fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{log.field_name}</span>
                    <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 10 }}>{formatDateTime(log.changed_at)}</span>
                  </div>
                  <div style={{ color: C.text, fontFamily: "monospace", fontSize: 12 }}>
                    <span style={{ color: C.textSub }}>{log.old_value ?? "—"}</span>
                    <span style={{ color: C.textMuted, margin: "0 8px" }}>→</span>
                    <span style={{ color: C.text, fontWeight: 600 }}>{log.new_value ?? "—"}</span>
                  </div>
                  {log.note && (
                    <div style={{ color: C.textSub, fontFamily: "monospace", fontSize: 11, fontStyle: "italic", marginTop: 4 }}>{log.note}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

// ── Site Card (reusable) ──────────────────────────────────────────
const SiteCard = ({ site }) => {
  const pct = site.quota_utilisation_pct;
  const atCapacity = site.available_slots === 0;
  return (
    <div style={{
      background: C.pageBg, border: `1px solid ${atCapacity ? "#fca5a5" : C.border}`,
      borderRadius: 6, padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ color: C.text, fontFamily: "monospace", fontSize: 13, fontWeight: 600, flex: 1 }}>{site.site_name}</div>
        {atCapacity && <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "1px 8px", borderRadius: 3, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>QUOTA FULL</span>}
        <span style={{ color: C.textSub, fontFamily: "monospace", fontSize: 12 }}>{site.used_slots} / {site.total_quota_slots} slots</span>
      </div>
      <div style={{ background: C.border, borderRadius: 2, height: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#dc2626" : pct >= 80 ? "#d97706" : "#16a34a", transition: "width 0.5s", borderRadius: 2 }} />
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, fontFamily: "monospace", marginTop: 5 }}>{pct}% utilisation · {site.available_slots} slots available</div>
    </div>
  );
};

// ── Days pill ─────────────────────────────────────────────
const DaysPill = ({ days }) => {
  const color = daysColor(days);
  const label = days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`;
  return (
    <span style={{
      background: `${color}14`, color, border: `1px solid ${color}40`,
      padding: "2px 10px", borderRadius: 10, fontSize: 11,
      fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap",
    }}>{label}</span>
  );
};

// ── Dashboard category section ────────────────────────────
const CategorySection = ({ title, alerts, placeholder }) => {
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
  const hasUrgent = alerts && alerts.some(a => a.status === "Critical" || a.status === "Expired");

  // Group by employer
  const byEmployer = {};
  (alerts || []).forEach(a => {
    const key = a.employer_name || "Unknown";
    if (!byEmployer[key]) byEmployer[key] = [];
    byEmployer[key].push(a);
  });
  const employerGroups = Object.entries(byEmployer);

  return (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${hasUrgent && count > 0 ? "#fecaca" : C.border}`,
      borderRadius: 8, overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      {/* Header */}
      <div onClick={toggle} style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "11px 16px",
        background: hasUrgent && count > 0 ? "#fff8f8" : C.pageBg,
        borderBottom: expanded ? `1px solid ${C.border}` : "none",
        cursor: "pointer", userSelect: "none",
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 1, background: hasUrgent && count > 0 ? C.accent : "#16a34a", flexShrink: 0 }} />
        <span style={{ color: C.text, fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", flex: 1 }}>{title}</span>
        {count > 0 ? (
          <span style={{
            background: hasUrgent ? "#fef2f2" : "#fffbeb",
            color: hasUrgent ? "#dc2626" : "#d97706",
            border: `1px solid ${hasUrgent ? "#fecaca" : "#fde68a"}`,
            padding: "1px 8px", borderRadius: 10, fontSize: 10, fontFamily: "monospace", fontWeight: 700,
          }}>{count}</span>
        ) : !placeholder ? (
          <span style={{ color: "#16a34a", fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}>✓ ALL CLEAR</span>
        ) : null}
        <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 4 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Body */}
      {expanded && (
        <div>
          {placeholder ? (
            <div style={{ padding: "14px 16px", color: C.textMuted, fontFamily: "monospace", fontSize: 12 }}>{placeholder}</div>
          ) : count === 0 ? (
            <div style={{ padding: "14px 16px", color: "#16a34a", fontFamily: "monospace", fontSize: 12 }}>✓ All documents are in order</div>
          ) : (
            employerGroups.map(([employer, rows], gi) => (
              <div key={employer}>
                {/* Employer sub-header */}
                <div style={{
                  padding: "5px 16px 5px 20px",
                  background: "#fafafa",
                  borderBottom: `1px solid ${C.borderLight}`,
                  borderTop: gi > 0 ? `1px solid ${C.borderLight}` : "none",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 10, letterSpacing: "0.08em" }}>
                    {employer}
                  </span>
                  <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 10 }}>· {rows.length}</span>
                </div>
                {/* Alert rows */}
                {rows.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "9px 16px 9px 20px",
                    borderBottom: i < rows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                    borderLeft: `3px solid ${STATUS_CONFIG[a.status]?.color || C.border}`,
                  }}>
                    <Badge status={a.status} />
                    <span style={{ color: C.text, fontFamily: "monospace", fontSize: 13, flex: 1 }}>{a.full_name}</span>
                    <span style={{ color: C.textMuted, fontSize: 11, fontFamily: "monospace" }}>{a.employee_number}</span>
                    <span style={{ color: C.textSub, fontSize: 11, fontFamily: "monospace" }}>{a.site_name}</span>
                    <DaysPill days={a.days_remaining} />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ── Dashboard Overview ────────────────────────────────────────────
const DashboardTab = () => {
  const { data: stats } = useFetch(`${API}/dashboard/stats`);
  const { data: alertData } = useFetch(`${API}/alerts/expiring?days=90`);

  const byType = {
    "Passport": [],
    "Work Permit Fee": [],
    "Insurance": [],
    "Visa Stamp": [],
  };
  (alertData?.alerts || []).forEach(a => {
    if (byType[a.expiry_type]) byType[a.expiry_type].push(a);
  });

  // Summary counts per category
  const categorySummary = [
    { key: "Passport",        label: "PASSPORTS",       color: "#3b82f6" },
    { key: "Work Permit Fee", label: "WORK PERMIT FEE", color: "#dc2626" },
    { key: "Insurance",       label: "INSURANCE",       color: "#d97706" },
    { key: "Visa Stamp",      label: "VISA STAMP",      color: "#a855f7" },
  ];

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="TOTAL EMPLOYEES" value={stats?.total_employees} sub={`across ${stats?.total_sites ?? "—"} sites`} accent={C.accent} />
        <StatCard label="EMPLOYERS" value={stats?.total_employers} accent="#3b82f6" />
        <StatCard label="EXPIRING SOON" value={stats?.total_alerts_critical} sub="within threshold" accent="#dc2626" glow />
        <StatCard label="WARNING" value={stats?.total_alerts_warning} sub="30–90 days" accent="#d97706" />
        <StatCard label="EXPIRED" value={stats?.total_alerts_expired} accent="#9ca3af" glow />
        <StatCard label="SITES AT CAPACITY" value={stats?.sites_at_capacity} accent="#a855f7" glow />
      </div>

      {/* Summary strip */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 20,
        background: C.cardBg, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "10px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        flexWrap: "wrap",
      }}>
        <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 10, letterSpacing: "0.1em", alignSelf: "center", marginRight: 4 }}>
          DOCUMENT ALERTS — 90 DAYS
        </span>
        {categorySummary.map(({ key, label, color }) => {
          const cnt = byType[key]?.length || 0;
          const urgent = byType[key]?.some(a => a.status === "Critical" || a.status === "Expired");
          return (
            <span key={key} style={{
              background: cnt > 0 ? `${urgent ? "#dc2626" : color}12` : C.pageBg,
              color: cnt > 0 ? (urgent ? "#dc2626" : color) : C.textMuted,
              border: `1px solid ${cnt > 0 ? (urgent ? "#dc262630" : `${color}30`) : C.border}`,
              padding: "3px 12px", borderRadius: 10,
              fontFamily: "monospace", fontSize: 10, fontWeight: 700,
            }}>
              {label} {cnt > 0 ? cnt : "✓"}
            </span>
          );
        })}
      </div>

      {/* Category sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CategorySection title="PASSPORTS"       alerts={byType["Passport"]} />
        <CategorySection title="WORK PERMIT FEE" alerts={byType["Work Permit Fee"]} />
        <CategorySection title="INSURANCE"       alerts={byType["Insurance"]} />
        <CategorySection title="VISA STAMP"      alerts={byType["Visa Stamp"]} />
        <CategorySection title="QUOTA SLOT"      alerts={[]} placeholder="Quota data coming soon" />
      </div>
    </div>
  );
};

// ── Alerts Tab ────────────────────────────────────────────────────
const AlertsTab = () => {
  const [days, setDays] = useState(60);
  const [filter, setFilter] = useState("All");
  const { data, loading } = useFetch(`${API}/alerts/expiring?days=${days}`);
  const filtered = data?.alerts?.filter(a => filter === "All" || a.status === filter) || [];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <div style={{ color: C.textMuted, fontSize: 12, fontFamily: "monospace" }}>LOOK-AHEAD:</div>
        {[30, 60, 90, 180].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            background: days === d ? C.accent : C.cardBg,
            color: days === d ? "#fff" : C.textSub,
            border: `1px solid ${days === d ? C.accent : C.border}`,
            padding: "4px 14px", borderRadius: 3,
            cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700,
          }}>{d}D</button>
        ))}
        <div style={{ flex: 1 }} />
        {[
          { value: "All",      label: "ALL" },
          { value: "Expired",  label: "EXPIRED" },
          { value: "Critical", label: "EXPIRING" },
          { value: "Warning",  label: "WARNING" },
        ].map(({ value, label }) => (
          <button key={value} onClick={() => setFilter(value)} style={{
            background: filter === value ? (STATUS_CONFIG[value]?.color || C.accent) : C.cardBg,
            color: filter === value ? "#fff" : C.textSub,
            border: `1px solid ${filter === value ? (STATUS_CONFIG[value]?.color || C.accent) : C.border}`,
            padding: "4px 14px", borderRadius: 3,
            cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700,
          }}>{label}</button>
        ))}
      </div>
      {loading ? (
        <div style={{ color: C.textMuted, fontFamily: "monospace", padding: 32, textAlign: "center" }}>LOADING...</div>
      ) : (
        <div>
          <div style={{ color: C.textMuted, fontSize: 11, fontFamily: "monospace", marginBottom: 12 }}>{filtered.length} RECORDS</div>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  {["STATUS", "EMPLOYEE", "EMP NO.", "DOCUMENT TYPE", "EXPIRY DATE", "DAYS", "SITE", "EMPLOYER"].map(h => (
                    <th key={h} style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 10, letterSpacing: "0.1em", padding: "10px 12px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}`, transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.rowHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 12px" }}><Badge status={a.status} /></td>
                    <td style={{ padding: "10px 12px", color: C.text, fontFamily: "monospace", fontSize: 13 }}>{a.full_name}</td>
                    <td style={{ padding: "10px 12px", color: C.textSub, fontFamily: "monospace", fontSize: 12 }}>{a.employee_number}</td>
                    <td style={{ padding: "10px 12px", color: C.textSub, fontFamily: "monospace", fontSize: 12 }}>{a.expiry_type}</td>
                    <td style={{ padding: "10px 12px", color: C.textSub, fontFamily: "monospace", fontSize: 12 }}>{a.expiry_date}</td>
                    <td style={{ padding: "10px 12px", color: STATUS_CONFIG[a.status]?.color, fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                      {a.days_remaining < 0 ? `–${Math.abs(a.days_remaining)}` : `+${a.days_remaining}`}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.textSub, fontFamily: "monospace", fontSize: 12 }}>{a.site_name}</td>
                    <td style={{ padding: "10px 12px", color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>{a.employer_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Employees Tab ─────────────────────────────────────────────────
const EmployeesTab = () => {
  const { data: employees, loading } = useFetch(`${API}/employees/?limit=200`);
  const { data: sites }     = useFetch(`${API}/sites/`);
  const { data: employers } = useFetch(`${API}/employers/`);
  const [showAddForm, setShowAddForm]     = useState(false);
  const [selectedEmp, setSelectedEmp]     = useState(null);
  const [localEmployees, setLocalEmployees] = useState(null);
  const [form, setForm]   = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [search, setSearch] = useState("");

  // Keep a local copy so we can update/delete without refetching
  useEffect(() => { if (employees) setLocalEmployees(employees); }, [employees]);

  // When employer changes in add form, reset site selection
  const handleFormChange = e => {
    const { name, value } = e.target;
    if (name === "employer_id") {
      setForm(f => ({ ...f, employer_id: value, site_id: "" }));
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handleAdd = async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/employees/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, employer_id: parseInt(form.employer_id), site_id: parseInt(form.site_id) }),
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

  // Filter sites to selected employer in add form
  const filteredSiteOptions = (sites || [])
    .filter(s => !form.employer_id || s.employer_id === parseInt(form.employer_id))
    .map(s => ({ value: s.id, label: `${s.site_name} (${s.used_slots}/${s.total_quota_slots} slots)` }));

  const employerOptions = (employers || []).map(e => ({ value: e.id, label: e.name }));

  // Search filtering
  const lowerSearch = search.toLowerCase().trim();
  const list = (localEmployees || []).filter(emp => {
    if (!lowerSearch) return true;
    const empName = (employers || []).find(e => e.id === emp.employer_id)?.name || "";
    const siteName = (sites || []).find(s => s.id === emp.site_id)?.site_name || "";
    return (
      emp.full_name?.toLowerCase().includes(lowerSearch) ||
      emp.employee_number?.toLowerCase().includes(lowerSearch) ||
      empName.toLowerCase().includes(lowerSearch) ||
      siteName.toLowerCase().includes(lowerSearch) ||
      emp.nationality?.toLowerCase().includes(lowerSearch)
    );
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, gap: 12, alignItems: "center" }}>
        {/* Search bar */}
        <input
          type="text"
          placeholder="Search by name, emp no., employer, site, nationality..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, maxWidth: 420, background: C.inputBg, border: `1px solid ${C.border}`,
            color: C.text, padding: "8px 14px", borderRadius: 6,
            fontFamily: "monospace", fontSize: 12, outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {success && <div style={{ color: "#16a34a", fontFamily: "monospace", fontSize: 12 }}>{success}</div>}
          <button onClick={() => { setShowAddForm(true); setForm({}); setError(null); }} style={{
            background: C.accent, color: "#fff", border: "none",
            padding: "8px 20px", borderRadius: 6, cursor: "pointer",
            fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          }}>+ ADD EMPLOYEE</button>
        </div>
      </div>

      {loading && !localEmployees ? (
        <div style={{ color: C.textMuted, fontFamily: "monospace", padding: 32, textAlign: "center" }}>LOADING...</div>
      ) : (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                {["EMP NO.", "NAME", "EMPLOYER", "SITE", "NATIONALITY", "PASSPORT", "VISA", "INSURANCE", "WORK PERMIT"].map(h => (
                  <th key={h} style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 10, letterSpacing: "0.1em", padding: "10px 10px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((emp) => (
                <tr key={emp.id}
                  onClick={() => setSelectedEmp(emp)}
                  style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fff0f0"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>{emp.employee_number}</td>
                  <td style={{ padding: "9px 10px", color: C.accent, fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>{emp.full_name}</td>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>
                    {(employers || []).find(e => e.id === emp.employer_id)?.name || emp.employer_id}
                  </td>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>
                    {(sites || []).find(s => s.id === emp.site_id)?.site_name || emp.site_id}
                  </td>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>{emp.nationality || "—"}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.passport_status        ? <Badge status={emp.passport_status.status}        /> : <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.visa_stamp_status      ? <Badge status={emp.visa_stamp_status.status}      /> : <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.insurance_status       ? <Badge status={emp.insurance_status.status}       /> : <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.work_permit_fee_status ? <Badge status={emp.work_permit_fee_status.status} /> : <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 12, padding: 32, textAlign: "center" }}>
              {search ? "No employees match your search." : "No employees found."}
            </div>
          )}
        </div>
      )}

      {/* Employee detail / edit modal */}
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

      {/* Add employee modal */}
      {showAddForm && (
        <Modal wide title="ADD NEW EMPLOYEE" onClose={() => { setShowAddForm(false); setError(null); }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <InputRow label="FULL NAME"       name="full_name"       value={form.full_name || ""}       onChange={handleFormChange} required />
            <InputRow label="EMPLOYEE NUMBER" name="employee_number" value={form.employee_number || ""} onChange={handleFormChange} required />
            <SelectRow label="EMPLOYER" name="employer_id" value={form.employer_id || ""} onChange={handleFormChange} options={employerOptions} required />
            <SelectRow label="SITE"     name="site_id"     value={form.site_id || ""}     onChange={handleFormChange} options={filteredSiteOptions} required />
            {/* Nationality dropdown */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", color: C.textSub, fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>NATIONALITY</label>
              <select name="nationality" value={form.nationality || ""} onChange={handleFormChange}
                style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, padding: "8px 12px", borderRadius: 4, fontFamily: "monospace", fontSize: 13, boxSizing: "border-box" }}>
                <option value="">— Select —</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <InputRow label="JOB TITLE" name="job_title" value={form.job_title || ""} onChange={handleFormChange} />
            {/* Passport — date only */}
            <InputRow label="PASSPORT EXPIRY" name="passport_expiry" type="date" value={form.passport_expiry || ""} onChange={handleFormChange} />
            {/* Visa Stamp — +1 YEAR */}
            <DateFieldWithCalc
              label="VISA STAMP EXPIRY" name="visa_stamp_expiry" value={form.visa_stamp_expiry || ""}
              onChange={handleFormChange} calcLabel="+ 1 YEAR"
              onCalc={() => setForm(f => ({ ...f, visa_stamp_expiry: addYears(f.visa_stamp_expiry, 1) }))}
            />
            {/* Insurance — +1 YEAR */}
            <DateFieldWithCalc
              label="INSURANCE EXPIRY" name="insurance_expiry" value={form.insurance_expiry || ""}
              onChange={handleFormChange} calcLabel="+ 1 YEAR"
              onCalc={() => setForm(f => ({ ...f, insurance_expiry: addYears(f.insurance_expiry, 1) }))}
            />
            {/* Work Permit Fee — +30 DAYS */}
            <DateFieldWithCalc
              label="WORK PERMIT FEE EXPIRY" name="work_permit_fee_expiry" value={form.work_permit_fee_expiry || ""}
              onChange={handleFormChange} calcLabel="+ 30 DAYS"
              onCalc={() => setForm(f => ({ ...f, work_permit_fee_expiry: addDays(f.work_permit_fee_expiry, 30) }))}
            />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowAddForm(false); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12 }}>CANCEL</button>
            <button onClick={handleAdd} style={{ background: C.accent, color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>CREATE</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Employers Tab (with nested Sites) ────────────────────────────
const EmployersTab = () => {
  const { data: employers, loading, refetch: refetchEmployers } = useFetch(`${API}/employers/`);
  const { data: sites, refetch: refetchSites } = useFetch(`${API}/sites/`);
  const [showEmployerForm, setShowEmployerForm] = useState(false);
  const [showSiteForm, setShowSiteForm] = useState(null);
  const [form, setForm]   = useState({});
  const [error, setError] = useState(null);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleAddEmployer = async () => {
    setError(null);
    const res = await fetch(`${API}/employers/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setShowEmployerForm(false); setForm({}); refetchEmployers(); }
    else { const d = await res.json(); setError(d.detail || "Error creating employer"); }
  };

  const handleAddSite = async () => {
    setError(null);
    const res = await fetch(`${API}/sites/`, {
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button onClick={() => { setShowEmployerForm(true); setForm({}); setError(null); }} style={{
          background: C.accent, color: "#fff", border: "none",
          padding: "8px 20px", borderRadius: 6, cursor: "pointer",
          fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
        }}>+ ADD EMPLOYER</button>
      </div>

      {loading ? (
        <div style={{ color: C.textMuted, fontFamily: "monospace", padding: 32, textAlign: "center" }}>LOADING...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(employers || []).map(employer => {
            const empSites   = sitesByEmployer[employer.id] || [];
            const totalSlots = empSites.reduce((s, x) => s + (x.total_quota_slots || 0), 0);
            const usedSlots  = empSites.reduce((s, x) => s + (x.used_slots || 0), 0);
            return (
              <div key={employer.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", background: C.pageBg, borderBottom: empSites.length > 0 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: C.accent, flexShrink: 0 }} />
                  <span style={{ color: C.text, fontFamily: "monospace", fontSize: 14, fontWeight: 700, flex: 1 }}>{employer.name}</span>
                  <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11, background: C.border, padding: "2px 8px", borderRadius: 3 }}>
                    {empSites.length} {empSites.length === 1 ? "SITE" : "SITES"}
                  </span>
                  {totalSlots > 0 && (
                    <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>{usedSlots}/{totalSlots} total slots</span>
                  )}
                  <button onClick={() => { setShowSiteForm(employer.id); setForm({}); setError(null); }} style={{
                    background: "transparent", color: C.accent, border: `1px solid ${C.accentBorder}`,
                    padding: "4px 12px", borderRadius: 4, cursor: "pointer",
                    fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                  }}>+ ADD SITE</button>
                </div>
                {empSites.length > 0 && (
                  <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {empSites.map(site => <SiteCard key={site.id} site={site} />)}
                  </div>
                )}
                {empSites.length === 0 && (
                  <div style={{ padding: "14px 20px", color: C.textMuted, fontFamily: "monospace", fontSize: 12 }}>
                    No sites yet — click + ADD SITE to create one.
                  </div>
                )}
              </div>
            );
          })}
          {(employers || []).length === 0 && (
            <div style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 13, textAlign: "center", padding: 48 }}>
              No employers found. Click + ADD EMPLOYER to get started.
            </div>
          )}
        </div>
      )}

      {showEmployerForm && (
        <Modal title="ADD NEW EMPLOYER" onClose={() => { setShowEmployerForm(false); setError(null); }}>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>⚠ {error}</div>}
          <InputRow label="EMPLOYER NAME"       name="name"                value={form.name || ""}                onChange={handleChange} required />
          <InputRow label="REGISTRATION NUMBER" name="registration_number" value={form.registration_number || ""} onChange={handleChange} required />
          <InputRow label="CONTACT NAME"        name="contact_name"        value={form.contact_name || ""}        onChange={handleChange} />
          <InputRow label="CONTACT EMAIL"       name="contact_email"       value={form.contact_email || ""}       onChange={handleChange} />
          <InputRow label="CONTACT PHONE"       name="contact_phone"       value={form.contact_phone || ""}       onChange={handleChange} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowEmployerForm(false); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12 }}>CANCEL</button>
            <button onClick={handleAddEmployer} style={{ background: C.accent, color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>CREATE</button>
          </div>
        </Modal>
      )}

      {showSiteForm && (
        <Modal title="ADD NEW SITE" onClose={() => { setShowSiteForm(null); setError(null); }}>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>⚠ {error}</div>}
          <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, padding: "8px 12px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, color: C.textSub, marginBottom: 16 }}>
            EMPLOYER: <strong style={{ color: C.text }}>{(employers || []).find(e => e.id === showSiteForm)?.name}</strong>
          </div>
          <InputRow label="SITE NAME"          name="site_name"          value={form.site_name || ""}          onChange={handleChange} required />
          <InputRow label="TOTAL QUOTA SLOTS"  name="total_quota_slots"  type="number" value={form.total_quota_slots || ""} onChange={handleChange} required />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowSiteForm(null); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12 }}>CANCEL</button>
            <button onClick={handleAddSite} style={{ background: C.accent, color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>CREATE</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Root App ──────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("OVERVIEW");
  const { data: headerStats } = useFetch(`${API}/dashboard/stats`);
  const criticalCount = headerStats?.total_alerts_critical ?? 0;
  const expiredCount  = headerStats?.total_alerts_expired  ?? 0;
  const urgentTotal   = criticalCount + expiredCount;

  return (
    <div style={{ background: C.pageBg, minHeight: "100vh", color: C.text, fontFamily: "'DM Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      <div style={{ position: "sticky", top: 0, zIndex: 50, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "0 32px", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, background: C.accent, borderRadius: 2 }} />
            <span style={{ color: C.text, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em" }}>WORK PERMIT TRACKER</span>
            {urgentTotal > 0 && (
              <span style={{
                background: "#dc2626", color: "#fff",
                fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                padding: "1px 6px", borderRadius: 10,
                boxShadow: "0 0 6px rgba(220,38,38,0.4)",
              }}>{urgentTotal}</span>
            )}
          </div>
          <div style={{ width: 1, height: 24, background: C.border }} />
          <span style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.08em" }}>EXPATRIATE COMPLIANCE MANAGEMENT</span>
          <div style={{ flex: 1 }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 8px rgba(22,163,74,0.5)" }} />
          <span style={{ color: C.textMuted, fontSize: 11 }}>LIVE</span>
        </div>
      </div>

      <div style={{ padding: "28px 32px" }}>
        <Tabs tabs={["OVERVIEW", "ALERTS", "EMPLOYEES", "EMPLOYERS"]} active={tab} onChange={setTab} />
        {tab === "OVERVIEW"  && <DashboardTab />}
        {tab === "ALERTS"    && <AlertsTab />}
        {tab === "EMPLOYEES" && <EmployeesTab />}
        {tab === "EMPLOYERS" && <EmployersTab />}
      </div>
    </div>
  );
}
