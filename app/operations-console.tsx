"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | null>;
type DataSet = {
  actor: { email: string; displayName: string; role: string };
  cases: Row[];
  refunds: Row[];
  flags: Row[];
  audit: Row[];
  documents: Row[];
};

type View = "home" | "kyc" | "refunds" | "flags" | "audit";

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "home", label: "Command center", glyph: "⌂" },
  { id: "kyc", label: "KYC reviews", glyph: "◎" },
  { id: "refunds", label: "Refunds", glyph: "↺" },
  { id: "flags", label: "Feature flags", glyph: "⚑" },
  { id: "audit", label: "Audit trail", glyph: "≡" },
];

const decisionOptions = [
  { value: "approved", label: "Approve" },
  { value: "information_requested", label: "Request information" },
  { value: "escalated", label: "Escalate" },
  { value: "rejected", label: "Reject" },
];

export function OperationsConsole({
  initialUser,
}: {
  initialUser: { displayName: string; email: string };
}) {
  const [view, setView] = useState<View>("home");
  const [data, setData] = useState<DataSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [environment, setEnvironment] = useState("production");
  const [selectedCase, setSelectedCase] = useState<Row | null>(null);
  const [selectedRefund, setSelectedRefund] = useState<Row | null>(null);
  const [selectedFlag, setSelectedFlag] = useState<Row | null>(null);
  const [modal, setModal] = useState<"refund" | "flag" | null>(null);
  const [decision, setDecision] = useState("approved");
  const [decisionNote, setDecisionNote] = useState("");
  const [flagRollout, setFlagRollout] = useState(0);
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const refresh = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/operations", { headers: { accept: "application/json" } });
      const payload = (await response.json()) as DataSet & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load operations data.");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load operations data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function runAction(payload: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string; message?: string };
    if (!response.ok) {
      setError(result.error ?? "The operation could not be completed.");
      return false;
    }
    setToast(result.message ?? "Saved.");
    window.setTimeout(() => setToast(""), 4200);
    await refresh();
    return true;
  }

  const cases = useMemo(() => data?.cases ?? [], [data?.cases]);
  const refunds = data?.refunds ?? [];
  const flags = data?.flags ?? [];
  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cases.filter((item) => {
      const matchesRisk = riskFilter === "all" || item.risk === riskFilter;
      const matchesQuery = !query || [item.id, item.customer_name, item.trigger, item.country]
        .some((value) => String(value).toLowerCase().includes(query));
      return matchesRisk && matchesQuery;
    });
  }, [cases, riskFilter, search]);

  const highRiskCases = cases.filter((item) => item.risk === "high" && !["approved", "rejected"].includes(String(item.status)));
  const pendingRefunds = refunds.filter((item) => ["pending_approval", "processor_pending", "failed"].includes(String(item.status)));
  const productionFlags = flags.filter((item) => item.environment === "production");

  function openCase(item: Row) {
    setSelectedCase(item);
    setDecision("approved");
    setDecisionNote("");
  }

  function openFlag(item: Row) {
    setSelectedFlag(item);
    setFlagRollout(Number(item.rollout));
    setFlagEnabled(Boolean(item.enabled));
    setFlagReason("");
  }

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">N</span>
          <div>
            <strong>Northstar</strong>
            <span>Operations</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setView(item.id)}
              data-testid={`nav-${item.id}`}
              type="button"
            >
              <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
              {item.label}
              {item.id === "kyc" && highRiskCases.length > 0 ? <span className="nav-count">{highRiskCases.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <div className="secure-row"><span className="secure-dot" /> Local workspace</div>
          <div className="user-card">
            <span className="avatar">{initials(data?.actor.displayName ?? initialUser.displayName)}</span>
            <div>
              <strong>{data?.actor.displayName ?? initialUser.displayName}</strong>
              <span>{data?.actor.role === "admin" ? "Operations administrator" : "Operations analyst"}</span>
            </div>
            <button type="button" aria-label="Open account menu">•••</button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">N</span> Northstar Ops</div>
          <div className="workspace-label"><span className="status-live" /> Local workspace</div>
          <div className="top-actions">
            <button className="icon-button" type="button" aria-label="Open notifications">
              <span aria-hidden="true">●</span><span className="notification-dot" />
            </button>
            <button className="command-button" type="button" onClick={() => setSearch("")}>
              <span aria-hidden="true">⌕</span> Search
              <kbd>⌘ K</kbd>
            </button>
          </div>
        </header>

        <div className="content">
          {error ? (
            <div className="alert error-alert" role="alert">
              <strong>Action needed</strong><span>{error}</span>
              <button onClick={() => setError("")} type="button" aria-label="Dismiss error">×</button>
            </div>
          ) : null}
          {toast ? <div className="toast" role="status"><span>✓</span>{toast}</div> : null}
          {loading ? <LoadingState /> : null}
          {!loading && data && view === "home" ? (
            <CommandCenter
              highRiskCases={highRiskCases}
              pendingRefunds={pendingRefunds}
              flags={productionFlags}
              audit={data.audit}
              onOpenCase={(item) => { setView("kyc"); openCase(item); }}
              onOpenRefund={(item) => { setView("refunds"); setSelectedRefund(item); }}
              onOpenFlag={(item) => { setView("flags"); openFlag(item); }}
            />
          ) : null}
          {!loading && data && view === "kyc" ? (
            <KycView
              cases={filteredCases}
              total={cases.length}
              search={search}
              riskFilter={riskFilter}
              onSearch={setSearch}
              onRisk={setRiskFilter}
              onOpen={openCase}
            />
          ) : null}
          {!loading && data && view === "refunds" ? (
            <RefundsView refunds={refunds} onOpen={setSelectedRefund} onCreate={() => setModal("refund")} />
          ) : null}
          {!loading && data && view === "flags" ? (
            <FlagsView
              flags={flags.filter((item) => item.environment === environment)}
              environment={environment}
              onEnvironment={setEnvironment}
              onOpen={openFlag}
              onCreate={() => setModal("flag")}
            />
          ) : null}
          {!loading && data && view === "audit" ? <AuditView events={data.audit} /> : null}
        </div>
      </main>

      {selectedCase ? (
        <CaseDrawer
          item={selectedCase}
          documents={(data?.documents ?? []).filter((doc) => doc.case_id === selectedCase.id)}
          decision={decision}
          note={decisionNote}
          onDecision={setDecision}
          onNote={setDecisionNote}
          onClose={() => setSelectedCase(null)}
          onAssign={async () => {
            if (await runAction({ action: "case.assign", id: selectedCase.id })) setSelectedCase(null);
          }}
          onSubmit={async () => {
            if (await runAction({ action: "case.decision", id: selectedCase.id, decision, note: decisionNote })) setSelectedCase(null);
          }}
          onUpload={async (file) => {
            const body = new FormData();
            body.append("caseId", String(selectedCase.id));
            body.append("file", file);
            const response = await fetch("/api/documents", { method: "POST", body });
            const result = (await response.json()) as { message?: string; error?: string };
            if (!response.ok) setError(result.error ?? "Upload failed.");
            else {
              setToast(result.message ?? "Evidence uploaded.");
              await refresh();
            }
          }}
        />
      ) : null}
      {selectedRefund ? (
        <RefundDrawer
          item={selectedRefund}
          onClose={() => setSelectedRefund(null)}
          onAction={async (action) => {
            if (await runAction({ action, id: selectedRefund.id })) setSelectedRefund(null);
          }}
        />
      ) : null}
      {selectedFlag ? (
        <FlagDrawer
          item={selectedFlag}
          rollout={flagRollout}
          enabled={flagEnabled}
          reason={flagReason}
          onRollout={setFlagRollout}
          onEnabled={setFlagEnabled}
          onReason={setFlagReason}
          onClose={() => setSelectedFlag(null)}
          onSave={async () => {
            if (await runAction({
              action: "flag.update",
              id: selectedFlag.id,
              rollout: flagRollout,
              enabled: flagEnabled,
              variant: selectedFlag.variant,
              reason: flagReason,
            })) setSelectedFlag(null);
          }}
        />
      ) : null}
      {modal === "refund" ? <CreateRefundModal onClose={() => setModal(null)} onCreate={async (payload) => {
        if (await runAction({ action: "refund.create", ...payload })) setModal(null);
      }} /> : null}
      {modal === "flag" ? <CreateFlagModal onClose={() => setModal(null)} onCreate={async (payload) => {
        if (await runAction({ action: "flag.create", ...payload })) setModal(null);
      }} /> : null}
    </div>
  );
}

function CommandCenter({
  highRiskCases,
  pendingRefunds,
  flags,
  audit,
  onOpenCase,
  onOpenRefund,
  onOpenFlag,
}: {
  highRiskCases: Row[];
  pendingRefunds: Row[];
  flags: Row[];
  audit: Row[];
  onOpenCase: (item: Row) => void;
  onOpenRefund: (item: Row) => void;
  onOpenFlag: (item: Row) => void;
}) {
  const activeFlags = flags.filter((item) => Boolean(item.enabled));
  return (
    <>
      <section className="hero-row">
        <div>
          <span className="eyebrow">Monday, July 27</span>
          <h1>Good morning, Gandharv.</h1>
          <p>Here’s the operational picture across risk, money movement, and releases.</p>
        </div>
        <div className="hero-callout">
          <span className="callout-icon">!</span>
          <div><strong>{highRiskCases.length} high-risk reviews</strong><span>One is inside the 60-minute escalation window.</span></div>
          <button type="button" onClick={() => highRiskCases[0] && onOpenCase(highRiskCases[0])}>Review now</button>
        </div>
      </section>

      <section className="metric-grid" aria-label="Operations summary">
        <MetricCard label="KYC queue" value="18" sub={`${highRiskCases.length} high risk`} tone="berry" trend="+3 since 8 AM" />
        <MetricCard label="Refund exposure" value="$11.8k" sub={`${pendingRefunds.length} need attention`} tone="gold" trend="↓ 12% vs. last Mon" />
        <MetricCard label="Release controls" value={`${activeFlags.length} live`} sub={`${flags.filter((item) => item.status === "draft").length} draft`} tone="mint" trend="All systems healthy" />
        <MetricCard label="SLA health" value="96.4%" sub="Last 24 hours" tone="blue" trend="↑ 1.8 pts" />
      </section>

      <section className="dashboard-grid">
        <div className="panel attention-panel">
          <PanelHeader eyebrow="Priority inbox" title="Needs your attention" action="View all" />
          <div className="attention-list">
            {highRiskCases.slice(0, 2).map((item) => (
              <button className="attention-item" key={String(item.id)} type="button" onClick={() => onOpenCase(item)}>
                <span className="attention-domain berry">KYC</span>
                <span className="attention-copy"><strong>{item.customer_name}</strong><small>{item.trigger}</small></span>
                <span className="attention-meta"><RiskBadge risk={String(item.risk)} /><small>{relativeSla(String(item.sla_at))}</small></span>
                <span className="arrow">→</span>
              </button>
            ))}
            {pendingRefunds.slice(0, 2).map((item) => (
              <button className="attention-item" key={String(item.id)} type="button" onClick={() => onOpenRefund(item)}>
                <span className="attention-domain gold">REF</span>
                <span className="attention-copy"><strong>{item.customer_name}</strong><small>{item.reason}</small></span>
                <span className="attention-meta"><StatusBadge status={String(item.status)} /><small>{money(Number(item.amount), String(item.currency))}</small></span>
                <span className="arrow">→</span>
              </button>
            ))}
            {flags.filter((item) => item.status === "draft").slice(0, 1).map((item) => (
              <button className="attention-item" key={String(item.id)} type="button" onClick={() => onOpenFlag(item)}>
                <span className="attention-domain mint">FLG</span>
                <span className="attention-copy"><strong>{item.name}</strong><small>Draft awaiting production review</small></span>
                <span className="attention-meta"><StatusBadge status={String(item.status)} /><small>{item.owner}</small></span>
                <span className="arrow">→</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel throughput-panel">
          <PanelHeader eyebrow="Last 7 days" title="Review throughput" action="Details" />
          <div className="chart-summary"><strong>428</strong><span>decisions completed</span><em>+8.2%</em></div>
          <div className="bar-chart" aria-label="Daily decision volume">
            {[42, 58, 46, 72, 64, 88, 73].map((height, index) => (
              <div className="bar-group" key={index}><div className="bar" style={{ height: `${height}%` }} /><span>{["M", "T", "W", "T", "F", "S", "S"][index]}</span></div>
            ))}
          </div>
          <div className="chart-legend"><span><i className="legend-dot berry" /> KYC reviews</span><span><i className="legend-dot gold" /> Refund decisions</span></div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel release-panel">
          <PanelHeader eyebrow="Production" title="Release pulse" action="Open flags" />
          {flags.slice(0, 3).map((flag) => (
            <button className="release-row" key={String(flag.id)} type="button" onClick={() => onOpenFlag(flag)}>
              <span className={flag.enabled ? "flag-state on" : "flag-state"}><i /></span>
              <span><strong>{flag.name}</strong><small>{flag.flag_key}</small></span>
              <span className="rollout"><i style={{ width: `${flag.rollout}%` }} /></span>
              <strong>{flag.rollout}%</strong>
            </button>
          ))}
        </div>
        <div className="panel activity-panel">
          <PanelHeader eyebrow="Immutable log" title="Recent activity" action="Audit trail" />
          {audit.slice(0, 4).map((event) => (
            <div className="activity-row" key={String(event.id)}>
              <span className={`activity-icon ${event.domain}`}>{domainGlyph(String(event.domain))}</span>
              <div><strong>{humanize(String(event.action))}</strong><span>{event.detail}</span><small>{actorName(String(event.actor))} · {shortTime(String(event.created_at))}</small></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function KycView({
  cases,
  total,
  search,
  riskFilter,
  onSearch,
  onRisk,
  onOpen,
}: {
  cases: Row[];
  total: number;
  search: string;
  riskFilter: string;
  onSearch: (value: string) => void;
  onRisk: (value: string) => void;
  onOpen: (item: Row) => void;
}) {
  return (
    <>
      <PageHeading eyebrow="Customer due diligence" title="KYC review queue" description="Prioritized identity and business verification cases with policy-aware decisions.">
        <button className="secondary-button" type="button">Export queue</button>
      </PageHeading>
      <section className="mini-stats">
        <MiniStat label="Open cases" value={String(total)} meta="Across 5 queues" />
        <MiniStat label="High risk" value={String(cases.filter((item) => item.risk === "high").length)} meta="Requires senior review" alert />
        <MiniStat label="Median age" value="36m" meta="Target under 45m" />
        <MiniStat label="SLA compliance" value="97.2%" meta="+2.1 pts this week" />
      </section>
      <section className="table-panel panel">
        <div className="table-tools">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search KYC cases</span>
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, case, trigger..." data-testid="kyc-search" />
          </label>
          <div className="filter-chips" aria-label="Risk filter">
            {["all", "high", "medium", "low"].map((risk) => (
              <button key={risk} type="button" onClick={() => onRisk(risk)} className={riskFilter === risk ? "active" : ""}>{humanize(risk)}</button>
            ))}
          </div>
          <span className="result-count">{cases.length} cases</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Risk</th><th>Trigger</th><th>Status</th><th>Assignee</th><th>SLA</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {cases.map((item) => (
                <tr key={String(item.id)}>
                  <td><button className="customer-cell" type="button" onClick={() => onOpen(item)} data-testid={`case-${item.id}`}><span className="entity-avatar">{initials(String(item.customer_name))}</span><span><strong>{item.customer_name}</strong><small>{item.id} · {item.country}</small></span></button></td>
                  <td><RiskBadge risk={String(item.risk)} /></td>
                  <td><span className="trigger-cell">{item.trigger}</span></td>
                  <td><StatusBadge status={String(item.status)} /></td>
                  <td>{item.assignee ? <span className="assignee"><i>{initials(actorName(String(item.assignee)))}</i>{actorName(String(item.assignee))}</span> : <span className="unassigned">Unassigned</span>}</td>
                  <td><span className={String(item.risk) === "high" ? "sla urgent" : "sla"}>{relativeSla(String(item.sla_at))}</span></td>
                  <td><button className="row-arrow" type="button" onClick={() => onOpen(item)} aria-label={`Open ${item.id}`}>→</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RefundsView({ refunds, onOpen, onCreate }: { refunds: Row[]; onOpen: (item: Row) => void; onCreate: () => void }) {
  const pendingValue = refunds.filter((item) => item.status !== "succeeded").reduce((sum, item) => sum + Number(item.amount), 0);
  return (
    <>
      <PageHeading eyebrow="Money movement" title="Refund operations" description="Review, approve, execute, and reconcile customer refunds from one controlled workflow.">
        <button className="primary-button" type="button" onClick={onCreate} data-testid="create-refund">+ Create refund</button>
      </PageHeading>
      <section className="mini-stats">
        <MiniStat label="Pending exposure" value={money(pendingValue, "USD")} meta="Across unresolved refunds" />
        <MiniStat label="Awaiting approval" value={String(refunds.filter((item) => item.status === "pending_approval").length)} meta="Maker-checker required" alert />
        <MiniStat label="Success rate" value="98.7%" meta="Last 30 days" />
        <MiniStat label="Median settlement" value="2h 14m" meta="18m faster this week" />
      </section>
      <section className="table-panel panel">
        <div className="table-tools">
          <div className="segmented"><button className="active" type="button">All refunds</button><button type="button">Needs attention</button><button type="button">Completed</button></div>
          <span className="result-count">Showing {refunds.length}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Refund</th><th>Customer</th><th>Amount</th><th>Reason</th><th>Risk</th><th>Status</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {refunds.map((item) => (
                <tr key={String(item.id)}>
                  <td><button className="id-link" type="button" onClick={() => onOpen(item)} data-testid={`refund-${item.id}`}>{item.id}<small>{item.payment_id}</small></button></td>
                  <td><strong>{item.customer_name}</strong></td>
                  <td><strong className="money">{money(Number(item.amount), String(item.currency))}</strong></td>
                  <td><span className="trigger-cell">{item.reason}</span></td>
                  <td><RiskBadge risk={String(item.risk)} /></td>
                  <td><StatusBadge status={String(item.status)} /></td>
                  <td><span className="muted">Today, {shortTime(String(item.updated_at))}</span></td>
                  <td><button className="row-arrow" type="button" onClick={() => onOpen(item)} aria-label={`Open ${item.id}`}>→</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function FlagsView({
  flags,
  environment,
  onEnvironment,
  onOpen,
  onCreate,
}: {
  flags: Row[];
  environment: string;
  onEnvironment: (value: string) => void;
  onOpen: (item: Row) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <PageHeading eyebrow="Release control" title="Feature flags" description="Progressive delivery with explicit ownership, safe defaults, and versioned production changes.">
        <button className="primary-button" type="button" onClick={onCreate} data-testid="create-flag">+ New flag</button>
      </PageHeading>
      <div className="flags-toolbar">
        <div className="environment-tabs" aria-label="Environment">
          {["development", "staging", "production"].map((item) => <button type="button" key={item} data-testid={`env-${item}`} className={environment === item ? "active" : ""} onClick={() => onEnvironment(item)}><span className={`env-dot ${item}`} />{humanize(item)}</button>)}
        </div>
        <div className="safety-note"><span>⌾</span><strong>Approval protected</strong> Production changes are fully audited.</div>
      </div>
      <section className="flag-grid">
        {flags.length ? flags.map((item) => (
          <button className="flag-card panel" key={String(item.id)} type="button" onClick={() => onOpen(item)} data-testid={`flag-${item.id}`}>
            <div className="flag-card-top"><span className={item.enabled ? "flag-state on" : "flag-state"}><i /></span><StatusBadge status={String(item.status)} /></div>
            <strong>{item.name}</strong>
            <code>{item.flag_key}</code>
            <p>{item.description}</p>
            <div className="flag-rule"><span>Rollout</span><div className="rollout"><i style={{ width: `${item.rollout}%` }} /></div><strong>{item.rollout}%</strong></div>
            <div className="flag-footer"><span><i className="team-avatar">{initials(String(item.owner))}</i>{item.owner}</span><span>v{item.version} · expires {shortDate(String(item.expires_at))}</span></div>
          </button>
        )) : <div className="empty-state panel"><span>⚑</span><strong>No flags in {environment}</strong><p>Create a safe-off draft or promote a reviewed configuration.</p></div>}
      </section>
    </>
  );
}

function AuditView({ events }: { events: Row[] }) {
  return (
    <>
      <PageHeading eyebrow="Control evidence" title="Unified audit trail" description="Immutable operational events across identity decisions, money movement, and production configuration.">
        <button className="secondary-button" type="button">Export evidence</button>
      </PageHeading>
      <section className="audit-layout">
        <div className="panel audit-filters">
          <strong>Event filters</strong>
          {["All activity", "KYC decisions", "Refunds", "Feature flags", "System access"].map((label, index) => <button className={index === 0 ? "active" : ""} type="button" key={label}><span>{["◫", "◎", "↺", "⚑", "◇"][index]}</span>{label}<small>{index === 0 ? events.length : Math.max(1, Math.floor(events.length / (index + 1)))}</small></button>)}
          <hr />
          <span className="filter-label">Retention policy</span>
          <p>7 years · append-only</p>
          <span className="evidence-chip">Evidence controls active</span>
        </div>
        <div className="panel audit-stream">
          <div className="audit-head"><strong>Recent events</strong><label><span>⌕</span><input placeholder="Search actor, object, action..." aria-label="Search audit trail" /></label></div>
          {events.map((event) => (
            <div className="audit-event" key={String(event.id)}>
              <span className={`activity-icon ${event.domain}`}>{domainGlyph(String(event.domain))}</span>
              <div className="audit-copy"><span><strong>{humanize(String(event.action))}</strong><code>{event.entity_id}</code></span><p>{event.detail}</p><small>{actorName(String(event.actor))} · {shortDateTime(String(event.created_at))}</small></div>
              <button type="button" aria-label={`View event ${event.id}`}>•••</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function CaseDrawer({
  item,
  documents,
  decision,
  note,
  onDecision,
  onNote,
  onClose,
  onAssign,
  onSubmit,
  onUpload,
}: {
  item: Row;
  documents: Row[];
  decision: string;
  note: string;
  onDecision: (value: string) => void;
  onNote: (value: string) => void;
  onClose: () => void;
  onAssign: () => void;
  onSubmit: () => void;
  onUpload: (file: File) => void;
}) {
  const closed = ["approved", "rejected"].includes(String(item.status));
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="case-title" data-testid="case-drawer">
        <div className="drawer-head">
          <div><span className="eyebrow">{item.id}</span><h2 id="case-title">{item.customer_name}</h2><p>{item.entity_type} · {item.country}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close case details">×</button>
        </div>
        <div className="drawer-status-row"><RiskBadge risk={String(item.risk)} /><StatusBadge status={String(item.status)} /><span className="score">Risk score <strong>{item.score}</strong>/100</span></div>
        <div className="policy-callout"><span>!</span><div><strong>{item.trigger}</strong><p>Policy KYC-4.2 requires evidence review and a documented disposition.</p></div></div>
        <div className="drawer-section">
          <div className="section-title"><span>01</span><div><strong>Identity evidence</strong><small>Collected during onboarding</small></div><em>3 checks</em></div>
          <div className="evidence-grid">
            <Evidence label="Government ID" value="Verified" meta="Passport · expires 2031" good />
            <Evidence label="Address" value="Verified" meta="Utility record · 12 days old" good />
            <Evidence label="Selfie match" value="98.2%" meta="Liveness passed" good />
          </div>
        </div>
        <div className="drawer-section">
          <div className="section-title"><span>02</span><div><strong>Screening results</strong><small>Latest provider response</small></div><em className="warning-text">1 potential match</em></div>
          <div className="screening-row"><span className="match-score">{item.score}%</span><div><strong>Possible name similarity</strong><small>OFAC SDN · geography and date of birth do not match</small></div><button type="button">View evidence</button></div>
        </div>
        <div className="drawer-section">
          <div className="section-title"><span>03</span><div><strong>Protected documents</strong><small>PDF, JPEG, or PNG · maximum 10 MB</small></div><em>{documents.length} uploaded</em></div>
          {documents.map((doc) => <div className="document-row" key={String(doc.id)}><span>▤</span><div><strong>{doc.file_name}</strong><small>{Math.ceil(Number(doc.size) / 1024)} KB · {actorName(String(doc.uploaded_by))}</small></div></div>)}
          <label className="upload-button">+ Add evidence<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} /></label>
        </div>
        {!closed ? (
          <div className="decision-box">
            <label>Decision<select value={decision} onChange={(event) => onDecision(event.target.value)} data-testid="case-decision">{decisionOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label>Decision rationale<textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="Document the evidence and policy basis for this decision..." data-testid="case-note" /></label>
          </div>
        ) : <div className="closed-banner">This case is closed. Its decision snapshot is immutable.</div>}
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          {!item.assignee && !closed ? <button className="secondary-button" type="button" onClick={onAssign}>Assign to me</button> : null}
          {!closed ? <button className="primary-button" type="button" onClick={onSubmit} disabled={!note.trim()} data-testid="submit-case-decision">Submit decision</button> : null}
        </div>
      </aside>
    </div>
  );
}

function RefundDrawer({ item, onClose, onAction }: { item: Row; onClose: () => void; onAction: (action: string) => void }) {
  const action = item.status === "pending_approval" ? "refund.approve" : item.status === "approved" ? "refund.execute" : item.status === "processor_pending" ? "refund.reconcile" : null;
  const actionLabel = item.status === "pending_approval" ? "Approve refund" : item.status === "approved" ? "Submit to processor" : item.status === "processor_pending" ? "Reconcile processor event" : "";
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer compact" role="dialog" aria-modal="true" aria-labelledby="refund-title" data-testid="refund-drawer">
        <div className="drawer-head"><div><span className="eyebrow">{item.id}</span><h2 id="refund-title">{money(Number(item.amount), String(item.currency))}</h2><p>{item.customer_name} · {item.payment_id}</p></div><button className="close-button" onClick={onClose} type="button" aria-label="Close refund details">×</button></div>
        <div className="drawer-status-row"><RiskBadge risk={String(item.risk)} /><StatusBadge status={String(item.status)} /></div>
        <div className="money-summary">
          <div><span>Original payment</span><strong>{money(Number(item.amount) + 76.2, String(item.currency))}</strong></div>
          <div><span>Refund amount</span><strong>{money(Number(item.amount), String(item.currency))}</strong></div>
          <div><span>Remaining refundable</span><strong>{money(76.2, String(item.currency))}</strong></div>
        </div>
        <div className="drawer-section"><div className="section-title"><span>01</span><div><strong>Eligibility checks</strong><small>Evaluated against payment and account state</small></div><em className="good-text">4 passed</em></div><div className="check-list">{["Payment settled", "Within refund window", "No active dispute", "Amount below refundable balance"].map((label) => <div key={label}><span>✓</span>{label}</div>)}</div></div>
        <div className="drawer-section"><div className="section-title"><span>02</span><div><strong>Request context</strong><small>Maker-checker evidence</small></div></div><dl className="detail-list"><div><dt>Reason</dt><dd>{item.reason}</dd></div><div><dt>Requested by</dt><dd>{actorName(String(item.requested_by))}</dd></div><div><dt>Approver</dt><dd>{item.approver ? actorName(String(item.approver)) : "Awaiting approval"}</dd></div><div><dt>Idempotency key</dt><dd><code>{String(item.idempotency_key).slice(0, 18)}…</code></dd></div></dl></div>
        <div className="drawer-section"><div className="section-title"><span>03</span><div><strong>Execution timeline</strong><small>Durable processor lifecycle</small></div></div><div className="timeline"><div className="done"><i /><span><strong>Request created</strong><small>Validated and recorded</small></span></div><div className={["approved", "processor_pending", "succeeded"].includes(String(item.status)) ? "done" : ""}><i /><span><strong>Approval</strong><small>Separation of duties</small></span></div><div className={["processor_pending", "succeeded"].includes(String(item.status)) ? "done" : ""}><i /><span><strong>Processor submission</strong><small>Idempotent command</small></span></div><div className={item.status === "succeeded" ? "done" : ""}><i /><span><strong>Reconciliation</strong><small>Ledger and provider matched</small></span></div></div></div>
        <div className="drawer-actions"><button className="secondary-button" type="button" onClick={onClose}>Close</button>{action ? <button className="primary-button" type="button" onClick={() => onAction(action)} data-testid="refund-primary-action">{actionLabel}</button> : null}</div>
      </aside>
    </div>
  );
}

function FlagDrawer({
  item,
  rollout,
  enabled,
  reason,
  onRollout,
  onEnabled,
  onReason,
  onClose,
  onSave,
}: {
  item: Row;
  rollout: number;
  enabled: boolean;
  reason: string;
  onRollout: (value: number) => void;
  onEnabled: (value: boolean) => void;
  onReason: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer compact" role="dialog" aria-modal="true" aria-labelledby="flag-title" data-testid="flag-drawer">
        <div className="drawer-head"><div><span className="eyebrow">{item.environment} · v{item.version}</span><h2 id="flag-title">{item.name}</h2><code>{item.flag_key}</code></div><button className="close-button" type="button" onClick={onClose} aria-label="Close flag details">×</button></div>
        <div className="flag-description">{item.description}</div>
        <div className="toggle-row"><div><strong>Flag state</strong><span>Safe default is off when evaluation is unavailable.</span></div><label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} data-testid="flag-enabled" /><span /></label></div>
        <div className="rollout-editor">
          <div>
            <label htmlFor="rollout-range">Percentage rollout</label>
            <label className="rollout-number"><span className="sr-only">Rollout percentage</span><input type="number" min="0" max="100" step="5" value={rollout} onChange={(event) => onRollout(Math.max(0, Math.min(100, Number(event.target.value))))} data-testid="flag-rollout-number" /><em>%</em></label>
          </div>
          <input id="rollout-range" type="range" min="0" max="100" step="5" value={rollout} onChange={(event) => onRollout(Number(event.target.value))} data-testid="flag-rollout" />
          <div className="range-labels"><span>0%</span><span>50%</span><span>100%</span></div>
        </div>
        <div className="simulation">
          <span>◎</span><div><strong>Estimated audience</strong><p>{enabled ? `${rollout.toLocaleString()} of every 100 eligible subjects` : "No subjects while the flag is disabled"} will receive <code>{item.variant}</code>.</p></div>
        </div>
        <div className="drawer-section"><div className="section-title"><span>01</span><div><strong>Ownership & lifecycle</strong><small>Required for production control</small></div></div><dl className="detail-list"><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Expires</dt><dd>{shortDate(String(item.expires_at))}</dd></div><div><dt>Last published by</dt><dd>{actorName(String(item.updated_by))}</dd></div><div><dt>Current status</dt><dd><StatusBadge status={String(item.status)} /></dd></div></dl></div>
        <label className="reason-field">Change reason<textarea value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Link the rollout to an approved change or incident..." data-testid="flag-reason" /></label>
        <div className="production-warning"><span>!</span><p><strong>Production change</strong>This publishes a new immutable version and records your identity in the audit trail.</p></div>
        <div className="drawer-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" onClick={onSave} disabled={!reason.trim()} data-testid="publish-flag">Publish configuration</button></div>
      </aside>
    </div>
  );
}

function CreateRefundModal({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: Record<string, unknown>) => void }) {
  const [paymentId, setPaymentId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [reason, setReason] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({ paymentId, customerName, amount: Number(amount), currency, reason });
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="create-refund-title" onSubmit={submit} data-testid="refund-modal">
        <div className="drawer-head"><div><span className="eyebrow">New money movement request</span><h2 id="create-refund-title">Create refund</h2><p>Eligibility is checked before the request enters the approval workflow.</p></div><button className="close-button" type="button" onClick={onClose} aria-label="Close create refund">×</button></div>
        <div className="form-grid">
          <label>Payment ID<input required value={paymentId} onChange={(event) => setPaymentId(event.target.value)} placeholder="PAY-…" data-testid="refund-payment-id" /></label>
          <label>Customer name<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer or business" data-testid="refund-customer" /></label>
          <label>Amount<input required min="0.01" max="10000" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" data-testid="refund-amount" /></label>
          <label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          <label className="full">Reason<select required value={reason} onChange={(event) => setReason(event.target.value)} data-testid="refund-reason"><option value="">Select a reason</option><option>Duplicate charge</option><option>Product returned</option><option>Service not delivered</option><option>Merchant adjustment</option></select></label>
        </div>
        <div className="eligibility-preview"><span>✓</span><div><strong>Pre-flight controls enabled</strong><p>Settlement, disputes, refundable balance, and duplicate requests will be checked on submit.</p></div></div>
        <div className="drawer-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" data-testid="submit-refund">Create request</button></div>
      </form>
    </div>
  );
}

function CreateFlagModal({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: Record<string, unknown>) => void }) {
  const [flagKey, setFlagKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("development");
  const [owner, setOwner] = useState("Platform");
  const [reason, setReason] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({ flagKey, name, description, environment, owner, reason });
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="create-flag-title" onSubmit={submit}>
        <div className="drawer-head"><div><span className="eyebrow">Safe-off by default</span><h2 id="create-flag-title">Create feature flag</h2><p>New flags begin disabled with a 0% rollout.</p></div><button className="close-button" type="button" onClick={onClose} aria-label="Close create flag">×</button></div>
        <div className="form-grid">
          <label>Flag key<input required pattern="[a-z][a-z0-9.-]+" value={flagKey} onChange={(event) => setFlagKey(event.target.value)} placeholder="domain.capability" data-testid="new-flag-key" /></label>
          <label>Display name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Human-readable name" data-testid="new-flag-name" /></label>
          <label>Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option>development</option><option>staging</option><option>production</option></select></label>
          <label>Owner<input required value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
          <label className="full">Description<textarea required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What behavior does this control?" data-testid="new-flag-description" /></label>
          <label className="full">Creation reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approved change, experiment, or incident reference" data-testid="new-flag-reason" /></label>
        </div>
        <div className="drawer-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" data-testid="submit-flag">Create safe-off draft</button></div>
      </form>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <section className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></section>;
}

function PanelHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action: string }) {
  return <div className="panel-head"><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button">{action} <span>→</span></button></div>;
}

function MetricCard({ label, value, sub, tone, trend }: { label: string; value: string; sub: string; tone: string; trend: string }) {
  return <article className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><i>↗</i></div><strong>{value}</strong><p>{sub}</p><small>{trend}</small></article>;
}

function MiniStat({ label, value, meta, alert }: { label: string; value: string; meta: string; alert?: boolean }) {
  return <article className={alert ? "mini-stat alert-stat" : "mini-stat"}><span>{label}</span><strong>{value}</strong><small>{meta}</small></article>;
}

function RiskBadge({ risk }: { risk: string }) {
  return <span className={`badge risk-${risk}`}><i />{humanize(risk)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status}`}><i />{humanize(status)}</span>;
}

function Evidence({ label, value, meta, good }: { label: string; value: string; meta: string; good?: boolean }) {
  return <div className="evidence-card"><span className={good ? "evidence-icon good" : "evidence-icon"}>{good ? "✓" : "!"}</span><div><small>{label}</small><strong>{value}</strong><p>{meta}</p></div></div>;
}

function LoadingState() {
  return <div className="loading-state" role="status"><span /><span /><span /><p>Loading operations data…</p></div>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actorName(email: string) {
  if (!email.includes("@")) return humanize(email);
  return email.split("@")[0].split(".").map((part) => humanize(part)).join(" ");
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function relativeSla(value: string) {
  const diff = new Date(value).getTime() - new Date("2026-07-28T05:30:00.000Z").getTime();
  const minutes = Math.round(Math.abs(diff) / 60000);
  if (diff < 0) return `${Math.floor(minutes / 60)}h ${minutes % 60}m overdue`;
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function shortDateTime(value: string) {
  return `${shortDate(value)} at ${shortTime(value)}`;
}

function domainGlyph(domain: string) {
  return domain === "kyc" ? "◎" : domain === "refunds" ? "↺" : domain === "flags" ? "⚑" : "◇";
}
