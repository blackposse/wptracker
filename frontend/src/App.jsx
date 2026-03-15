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
  Valid:    { color: "#16a34a", bg: "#f0fdf4", label: "VALID",    icon: "✓" },
  Warning:  { color: "#d97706", bg: "#fffbeb", label: "WARNING",  icon: "⚠" },
  Critical: { color: "#dc2626", bg: "#fef2f2", label: "CRITICAL", icon: "✕" },
  Expired:  { color: "#9ca3af", bg: "#f3f4f6", label: "EXPIRED",  icon: "✗" },
};

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

const StatCard = ({ label, value, sub, accent }) => (
  <div style={{
    background: C.cardBg, border: `1px solid ${C.border}`,
    padding: "20px 24px", borderRadius: 8,
    borderLeft: `3px solid ${accent || C.border}`,
    flex: 1, minWidth: 160,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  }}>
    <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.12em", fontFamily: "monospace", marginBottom: 8 }}>{label}</div>
    <div style={{ color: C.text, fontSize: 32, fontWeight: 800, lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>{value ?? "—"}</div>
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

const Modal = ({ title, onClose, children }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    backdropFilter: "blur(2px)",
  }} onClick={onClose}>
    <div style={{
      background: C.cardBg, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 32, minWidth: 480, maxWidth: 560,
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

const InputRow = ({ label, name, type = "text", value, onChange, required }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: "block", color: C.textSub, fontSize: 11, letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 4 }}>
      {label}{required && <span style={{ color: C.accent }}> *</span>}
    </label>
    <input type={type} name={name} value={value} onChange={onChange} required={required}
      style={{
        width: "100%", background: C.inputBg, border: `1px solid ${C.border}`,
        color: C.text, padding: "8px 12px", borderRadius: 4,
        fontFamily: "monospace", fontSize: 13, boxSizing: "border-box", outline: "none",
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
        {atCapacity && (
          <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "1px 8px", borderRadius: 3, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>QUOTA FULL</span>
        )}
        <span style={{ color: C.textSub, fontFamily: "monospace", fontSize: 12 }}>{site.used_slots} / {site.total_quota_slots} slots</span>
      </div>
      <div style={{ background: C.border, borderRadius: 2, height: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#dc2626" : pct >= 80 ? "#d97706" : "#16a34a", transition: "width 0.5s", borderRadius: 2 }} />
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, fontFamily: "monospace", marginTop: 5 }}>{pct}% utilisation · {site.available_slots} slots available</div>
    </div>
  );
};

// ── Dashboard Overview ────────────────────────────────────────────
const DashboardTab = () => {
  const { data: stats } = useFetch(`${API}/dashboard/stats`);
  const { data: alertData } = useFetch(`${API}/alerts/expiring?days=60`);

  // Group alerts by employer
  const byEmployer = {};
  (alertData?.alerts || []).forEach(a => {
    const key = a.employer_name || "Unknown";
    if (!byEmployer[key]) byEmployer[key] = [];
    byEmployer[key].push(a);
  });
  const employerGroups = Object.entries(byEmployer);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard label="TOTAL EMPLOYEES" value={stats?.total_employees} sub={`across ${stats?.total_sites ?? "—"} sites`} accent={C.accent} />
        <StatCard label="EMPLOYERS" value={stats?.total_employers} accent="#3b82f6" />
        <StatCard label="CRITICAL ALERTS" value={stats?.total_alerts_critical} sub="< 30 days" accent="#dc2626" />
        <StatCard label="WARNING ALERTS" value={stats?.total_alerts_warning} sub="30–90 days" accent="#d97706" />
        <StatCard label="EXPIRED DOCS" value={stats?.total_alerts_expired} accent="#9ca3af" />
        <StatCard label="SITES AT CAPACITY" value={stats?.sites_at_capacity} accent="#a855f7" />
      </div>

      {/* Alerts grouped by employer */}
      {employerGroups.length > 0 && (
        <div>
          <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: 16 }}>
            URGENT ALERTS — EXPIRING WITHIN 60 DAYS ({alertData.total})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {employerGroups.map(([employer, alerts]) => (
              <div key={employer} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                {/* Employer header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px", background: C.pageBg,
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: 1, background: C.accent }} />
                  <span style={{ color: C.text, fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>{employer}</span>
                  <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>— {alerts.length} alert{alerts.length !== 1 ? "s" : ""}</span>
                </div>
                {/* Alert rows */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "9px 16px",
                      borderBottom: i < alerts.length - 1 ? `1px solid ${C.borderLight}` : "none",
                      borderLeft: `3px solid ${STATUS_CONFIG[a.status]?.color || C.border}`,
                    }}>
                      <Badge status={a.status} />
                      <span style={{ color: C.text, fontFamily: "monospace", fontSize: 13, flex: 1 }}>{a.full_name}</span>
                      <span style={{ color: C.textMuted, fontSize: 11, fontFamily: "monospace" }}>{a.expiry_type}</span>
                      <span style={{ color: C.textSub, fontSize: 11, fontFamily: "monospace" }}>{a.site_name}</span>
                      <span style={{ color: STATUS_CONFIG[a.status]?.color, fontSize: 12, fontFamily: "monospace", fontWeight: 700, minWidth: 80, textAlign: "right" }}>
                        {a.days_remaining < 0 ? `${Math.abs(a.days_remaining)}d ago` : `${a.days_remaining}d left`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
        {["All", "Expired", "Critical", "Warning"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATUS_CONFIG[f]?.color || C.accent) : C.cardBg,
            color: filter === f ? "#fff" : C.textSub,
            border: `1px solid ${filter === f ? (STATUS_CONFIG[f]?.color || C.accent) : C.border}`,
            padding: "4px 14px", borderRadius: 3,
            cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700,
          }}>{f.toUpperCase()}</button>
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
  const { data: employees, loading, refetch } = useFetch(`${API}/employees/?limit=200`);
  const { data: sites } = useFetch(`${API}/sites/`);
  const { data: employers } = useFetch(`${API}/employers/`);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
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
        setSuccess(`Employee ${data.full_name} added successfully.`);
        setShowForm(false); setForm({}); refetch();
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (e) { setError(e.message); }
  };

  const siteOptions = (sites || []).map(s => ({ value: s.id, label: `${s.site_name} (${s.used_slots}/${s.total_quota_slots} slots)` }));
  const employerOptions = (employers || []).map(e => ({ value: e.id, label: e.name }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, gap: 12, alignItems: "center" }}>
        {success && <div style={{ color: "#16a34a", fontFamily: "monospace", fontSize: 12 }}>{success}</div>}
        <button onClick={() => setShowForm(true)} style={{
          background: C.accent, color: "#fff", border: "none",
          padding: "8px 20px", borderRadius: 6, cursor: "pointer",
          fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
        }}>+ ADD EMPLOYEE</button>
      </div>

      {loading ? (
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
              {(employees || []).map((emp) => (
                <tr key={emp.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.rowHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>{emp.employee_number}</td>
                  <td style={{ padding: "9px 10px", color: C.text, fontFamily: "monospace", fontSize: 13 }}>{emp.full_name}</td>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>{emp.employer_name || emp.employer_id}</td>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>{emp.site_name || emp.site_id}</td>
                  <td style={{ padding: "9px 10px", color: C.textSub, fontFamily: "monospace", fontSize: 11 }}>{emp.nationality || "—"}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.passport_status ? <Badge status={emp.passport_status.status} /> : <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>—</span>}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.visa_stamp_status ? <Badge status={emp.visa_stamp_status.status} /> : <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>—</span>}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.insurance_status ? <Badge status={emp.insurance_status.status} /> : <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>—</span>}</td>
                  <td style={{ padding: "9px 10px" }}>{emp.work_permit_fee_status ? <Badge status={emp.work_permit_fee_status.status} /> : <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="ADD NEW EMPLOYEE" onClose={() => { setShowForm(false); setError(null); }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <InputRow label="FULL NAME" name="full_name" value={form.full_name || ""} onChange={handleChange} required />
            <InputRow label="EMPLOYEE NUMBER" name="employee_number" value={form.employee_number || ""} onChange={handleChange} required />
            <SelectRow label="EMPLOYER" name="employer_id" value={form.employer_id || ""} onChange={handleChange} options={employerOptions} required />
            <SelectRow label="SITE" name="site_id" value={form.site_id || ""} onChange={handleChange} options={siteOptions} required />
            <InputRow label="NATIONALITY" name="nationality" value={form.nationality || ""} onChange={handleChange} />
            <InputRow label="JOB TITLE" name="job_title" value={form.job_title || ""} onChange={handleChange} />
            <InputRow label="PASSPORT EXPIRY" name="passport_expiry" type="date" value={form.passport_expiry || ""} onChange={handleChange} />
            <InputRow label="VISA STAMP EXPIRY" name="visa_stamp_expiry" type="date" value={form.visa_stamp_expiry || ""} onChange={handleChange} />
            <InputRow label="INSURANCE EXPIRY" name="insurance_expiry" type="date" value={form.insurance_expiry || ""} onChange={handleChange} />
            <InputRow label="WORK PERMIT FEE EXPIRY" name="work_permit_fee_expiry" type="date" value={form.work_permit_fee_expiry || ""} onChange={handleChange} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowForm(false); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12 }}>CANCEL</button>
            <button onClick={handleSubmit} style={{ background: C.accent, color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>CREATE</button>
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
  const [showSiteForm, setShowSiteForm] = useState(null); // employer_id for add site
  const [form, setForm] = useState({});
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

  // Group sites by employer_id
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
            const empSites = sitesByEmployer[employer.id] || [];
            const totalSlots = empSites.reduce((s, x) => s + (x.total_quota_slots || 0), 0);
            const usedSlots  = empSites.reduce((s, x) => s + (x.used_slots || 0), 0);
            return (
              <div key={employer.id} style={{
                background: C.cardBg, border: `1px solid ${C.border}`,
                borderRadius: 10, overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}>
                {/* Employer header bar */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 20px", background: C.pageBg,
                  borderBottom: empSites.length > 0 ? `1px solid ${C.border}` : "none",
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: C.accent, flexShrink: 0 }} />
                  <span style={{ color: C.text, fontFamily: "monospace", fontSize: 14, fontWeight: 700, flex: 1 }}>{employer.name}</span>
                  <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11, background: C.border, padding: "2px 8px", borderRadius: 3 }}>
                    {empSites.length} {empSites.length === 1 ? "SITE" : "SITES"}
                  </span>
                  {totalSlots > 0 && (
                    <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>
                      {usedSlots}/{totalSlots} total slots
                    </span>
                  )}
                  <button onClick={() => { setShowSiteForm(employer.id); setForm({}); setError(null); }} style={{
                    background: "transparent", color: C.accent,
                    border: `1px solid ${C.accentBorder}`,
                    padding: "4px 12px", borderRadius: 4, cursor: "pointer",
                    fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                  }}>+ ADD SITE</button>
                </div>

                {/* Sites under this employer */}
                {empSites.length > 0 && (
                  <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {empSites.map(site => <SiteCard key={site.id} site={site} />)}
                  </div>
                )}

                {empSites.length === 0 && (
                  <div style={{ padding: "16px 20px", color: C.textMuted, fontFamily: "monospace", fontSize: 12 }}>
                    No sites added yet — click + ADD SITE to create one.
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

      {/* Add Employer Modal */}
      {showEmployerForm && (
        <Modal title="ADD NEW EMPLOYER" onClose={() => { setShowEmployerForm(false); setError(null); }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          <InputRow label="EMPLOYER NAME" name="name" value={form.name || ""} onChange={handleChange} required />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => { setShowEmployerForm(false); setError(null); }} style={{ background: C.pageBg, color: C.textSub, border: `1px solid ${C.border}`, padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12 }}>CANCEL</button>
            <button onClick={handleAddEmployer} style={{ background: C.accent, color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>CREATE</button>
          </div>
        </Modal>
      )}

      {/* Add Site Modal (pre-bound to employer) */}
      {showSiteForm && (
        <Modal title="ADD NEW SITE" onClose={() => { setShowSiteForm(null); setError(null); }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, padding: "8px 12px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, color: C.textSub, marginBottom: 16 }}>
            EMPLOYER: <strong style={{ color: C.text }}>{(employers || []).find(e => e.id === showSiteForm)?.name}</strong>
          </div>
          <InputRow label="SITE NAME" name="site_name" value={form.site_name || ""} onChange={handleChange} required />
          <InputRow label="TOTAL QUOTA SLOTS" name="total_quota_slots" type="number" value={form.total_quota_slots || ""} onChange={handleChange} required />
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

  return (
    <div style={{ background: C.pageBg, minHeight: "100vh", color: C.text, fontFamily: "'DM Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "0 32px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, background: C.accent, borderRadius: 2 }} />
            <span style={{ color: C.text, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em" }}>WORK PERMIT TRACKER</span>
          </div>
          <div style={{ width: 1, height: 24, background: C.border }} />
          <span style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.08em" }}>EXPATRIATE COMPLIANCE MANAGEMENT</span>
          <div style={{ flex: 1 }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 8px rgba(22,163,74,0.5)" }} />
          <span style={{ color: C.textMuted, fontSize: 11 }}>LIVE</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "28px 32px" }}>
        <Tabs
          tabs={["OVERVIEW", "ALERTS", "EMPLOYEES", "EMPLOYERS"]}
          active={tab}
          onChange={setTab}
        />
        {tab === "OVERVIEW"   && <DashboardTab />}
        {tab === "ALERTS"     && <AlertsTab />}
        {tab === "EMPLOYEES"  && <EmployeesTab />}
        {tab === "EMPLOYERS"  && <EmployersTab />}
      </div>
    </div>
  );
}
