"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { seedActivities, seedHouseholds, seedOpportunities, seedTasks, seedWorkflowSteps } from "@/lib/workspace-seed";
import type { WorkspaceSnapshot } from "@/lib/workspace-types";

type ViewMode = "book" | "service" | "household";
type CaptureType = "Note" | "Task" | "Decision";

type Props = {
  mode: ViewMode;
  householdName: string;
  setHouseholdName: (name: string) => void;
  totalAssets: number;
  taxableAssets: number;
  taxDeferredAssets: number;
  taxFreeAssets: number;
  coordinatedMagi: number;
  conversionCapacity: number;
  federalTax: number;
  onOpenPlanner: () => void;
  onOpenHousehold: () => void;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const initialSnapshot: WorkspaceSnapshot = {
  households: seedHouseholds,
  tasks: seedTasks,
  activities: seedActivities,
  opportunities: seedOpportunities,
  workflowSteps: seedWorkflowSteps,
  auditEvents: [],
  plannerScenario: null,
  updatedAt: "2026-08-12T13:00:00.000Z",
};

const metricChoices = ["Book assets", "Households", "Open work", "Reviews due", "Watch list", "Pipeline"] as const;
type MetricChoice = (typeof metricChoices)[number];

function formatDate(value: string) {
  return date.format(new Date(`${value}T12:00:00Z`));
}

function relativeContact(value: string) {
  const days = Math.max(0, Math.round((Date.parse("2026-08-12T12:00:00Z") - Date.parse(`${value}T12:00:00Z`)) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function AdvisorWorkspace({
  mode,
  householdName,
  setHouseholdName,
  totalAssets,
  taxableAssets,
  taxDeferredAssets,
  taxFreeAssets,
  coordinatedMagi,
  conversionCapacity,
  federalTax,
  onOpenPlanner,
  onOpenHousehold,
}: Props) {
  const [workspace, setWorkspace] = useState(initialSnapshot);
  const [captureType, setCaptureType] = useState<CaptureType>("Note");
  const [captureText, setCaptureText] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [bookQuery, setBookQuery] = useState("");
  const [bookFilter, setBookFilter] = useState("All households");
  const [selectedBookId, setSelectedBookId] = useState("household-1");
  const [showCustomize, setShowCustomize] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<MetricChoice[]>(["Book assets", "Households", "Open work", "Reviews due", "Watch list", "Pipeline"]);
  const [meetingNotes, setMeetingNotes] = useState("");
  const [showDraft, setShowDraft] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Workspace records are temporarily unavailable.");
        return response.json() as Promise<WorkspaceSnapshot>;
      })
      .then(setWorkspace)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSyncError(error instanceof Error ? error.message : "Workspace records are temporarily unavailable.");
      });

    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem("advisor-workspace-visible-metrics-v1");
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as string[];
        const valid = parsed.filter((item): item is MetricChoice => metricChoices.includes(item as MetricChoice));
        if (valid.length) setVisibleMetrics(valid);
      } catch { /* Keep default presentation preferences. */ }
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  const postAction = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setSyncError("");
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as WorkspaceSnapshot & { error?: string };
      if (!response.ok) throw new Error(result.error || "The action could not be completed.");
      setWorkspace(result);
      return true;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "The action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitCapture = async (event: FormEvent) => {
    event.preventDefault();
    const detail = captureText.trim();
    if (!detail) return;
    const ok = await postAction({ action: "create_activity", householdId: "household-1", type: captureType, detail });
    if (ok) setCaptureText("");
  };

  const createControlledTask = (title: string, category: string, requiresApproval = false) => postAction({ action: "create_task", householdId: "household-1", title, category, requiresApproval });
  const household = workspace.households.find((item) => item.id === "household-1") ?? seedHouseholds[0];
  const selectedBookHousehold = workspace.households.find((item) => item.id === selectedBookId) ?? household;
  const householdTasks = workspace.tasks.filter((task) => task.householdId === "household-1");
  const openTasks = householdTasks.filter((task) => task.status === "open");
  const householdActivities = workspace.activities.filter((activity) => activity.householdId === "household-1");
  const workflow = workspace.workflowSteps.filter((step) => step.householdId === "household-1").sort((a, b) => a.sequence - b.sequence);
  const nextWorkflow = workflow.findIndex((step) => step.status !== "completed");
  const totalPipeline = workspace.opportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
  const bookAssets = workspace.households.reduce((sum, item) => sum + item.assets, 0);

  const filteredHouseholds = useMemo(() => workspace.households.filter((item) => {
    const query = bookQuery.trim().toLowerCase();
    const matchesQuery = !query || [item.name, item.primaryName, item.partnerName, ...item.tags].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    const matchesFilter = bookFilter === "All households"
      || (bookFilter === "Needs attention" && item.riskLevel !== "Low")
      || (bookFilter === "Reviews due" && item.nextReview <= "2026-08-31")
      || (bookFilter === "Plan linked" && item.linkedPlan);
    return matchesQuery && matchesFilter;
  }), [bookFilter, bookQuery, workspace.households]);

  const metrics: Record<MetricChoice, { value: string; note: string }> = {
    "Book assets": { value: compactMoney.format(bookAssets), note: "Illustrative assets" },
    Households: { value: String(workspace.households.length), note: "1 planning-linked" },
    "Open work": { value: String(workspace.tasks.filter((task) => task.status === "open").length), note: `${openTasks.filter((task) => task.dueDate <= "2026-08-12").length} due today` },
    "Reviews due": { value: String(workspace.households.filter((item) => item.nextReview <= "2026-08-31").length), note: "Next 30 days" },
    "Watch list": { value: String(workspace.households.filter((item) => item.riskLevel !== "Low").length), note: "Explainable signals" },
    Pipeline: { value: compactMoney.format(totalPipeline), note: `${workspace.opportunities.length} opportunities` },
  };

  const toggleMetric = (metric: MetricChoice) => {
    const next = visibleMetrics.includes(metric) ? visibleMetrics.filter((item) => item !== metric) : [...visibleMetrics, metric];
    if (!next.length) return;
    setVisibleMetrics(next);
    localStorage.setItem("advisor-workspace-visible-metrics-v1", JSON.stringify(next));
  };

  const insights = [
    { id: "conversion", priority: "Planning", household: householdName, title: `Screen ${money.format(conversionCapacity)} Roth conversion capacity`, reason: "Current assumptions leave room below the selected bracket and IRMAA guardrails.", evidence: `Modeled MAGI ${money.format(coordinatedMagi)} · 2026 planning engine`, task: "Review the modeled Roth conversion range and document advisor conclusion", approval: true },
    { id: "cash", priority: "Liquidity", household: "Illustrative household 03", title: `${money.format(940000)} cash balance warrants review`, reason: "Cash represents 11.3% of the illustrative relationship assets.", evidence: "Illustrative account aggregation · Aug 12", task: "Review liquidity needs and cash investment policy", approval: false },
    { id: "review", priority: "Service", household: "Illustrative household 02", title: "Annual review due in 2 days", reason: "Two open items remain and the review packet has not been marked complete.", evidence: "Review calendar + open-work queue", task: "Complete annual review preparation checklist", approval: false },
    { id: "contact", priority: "Engagement", household: "Illustrative household 04", title: "No documented contact in 103 days", reason: "The service cadence calls for a documented touchpoint every 90 days.", evidence: "Activity history through Aug 12", task: "Prepare compliant client check-in for manual review", approval: true },
  ];

  return (
    <>
      <section className="ops-connection" aria-label="Workspace status">
        <div><span className="case-tag">ILLUSTRATIVE DATA</span><div><b>Client engagement workspace</b><small>Book intelligence, service work and planning share a governed client record.</small></div></div>
        <div className="connection-status durable"><i /><span><b>Durable workspace</b><small>Server-backed records · append-only audit events</small></span></div>
      </section>

      {syncError && <div className="sync-error" role="alert"><b>Workspace notice</b><span>{syncError} Showing the last available illustrative snapshot.</span><button onClick={() => window.location.reload()}>Retry</button></div>}

      {mode === "book" && (
        <>
          <section className="book-hero"><div><p className="eyebrow">BOOK 360</p><h2>Your practice at a glance</h2><p>Priorities are ranked from documented household, service and planning signals—not unexplained scores.</p></div><div className="book-search"><label><span>Search book</span><input type="search" placeholder="Household, client or tag" value={bookQuery} onChange={(event) => setBookQuery(event.target.value)} /></label><button className="button secondary" onClick={() => setShowCustomize((current) => !current)} aria-expanded={showCustomize}>Customize tiles</button></div></section>

          {showCustomize && <section className="tile-customizer" aria-label="Customize dashboard metrics"><b>Visible metrics</b>{metricChoices.map((metric) => <label key={metric}><input type="checkbox" checked={visibleMetrics.includes(metric)} onChange={() => toggleMetric(metric)} />{metric}</label>)}<small>Presentation preferences are stored on this device; client records are not.</small></section>}

          <section className="book-metrics" aria-label="Book metrics">{visibleMetrics.map((metric) => <article key={metric}><span>{metric}</span><strong>{metrics[metric].value}</strong><small>{metrics[metric].note}</small></article>)}</section>

          <div className="book-main-grid">
            <section className="panel insight-panel"><div className="panel-heading compact"><div><span className="step">CLIENT INSIGHTS</span><h2>Priority opportunities</h2></div><span className="count-badge">{insights.length}</span></div><div className="insight-list">{insights.map((insight) => <article key={insight.id}><div className="insight-top"><span>{insight.priority}</span><small>{insight.household}</small></div><h3>{insight.title}</h3><p>{insight.reason}</p><small className="evidence">Source: {insight.evidence}</small><button disabled={busy} onClick={() => createControlledTask(insight.task, insight.priority, insight.approval)}>Create review task</button></article>)}</div></section>

            <section className="panel book-panel"><div className="panel-heading compact"><div><span className="step">HOUSEHOLDS</span><h2>Relationship book</h2></div><span className="muted">{filteredHouseholds.length} shown</span></div><div className="book-filters" role="group" aria-label="Filter households">{["All households", "Needs attention", "Reviews due", "Plan linked"].map((filter) => <button className={bookFilter === filter ? "active" : ""} onClick={() => setBookFilter(filter)} key={filter}>{filter}</button>)}</div><div className="book-table" role="table" aria-label="Illustrative household book"><div className="book-row header" role="row"><span>Household</span><span>Assets</span><span>Last contact</span><span>Next review</span><span>Signal</span></div>{filteredHouseholds.map((item) => <button className={`book-row ${selectedBookId === item.id ? "selected" : ""}`} role="row" onClick={() => setSelectedBookId(item.id)} key={item.id}><span><b>{item.name}</b><small>{item.primaryName}{item.partnerName ? ` + ${item.partnerName}` : ""}</small></span><span>{compactMoney.format(item.assets)}</span><span>{relativeContact(item.lastContact)}</span><span>{formatDate(item.nextReview)}</span><span className={`risk ${item.riskLevel.toLowerCase()}`}>{item.riskLevel}</span></button>)}</div></section>

            <aside className="panel book-peek" aria-live="polite"><div><span className={`risk ${selectedBookHousehold.riskLevel.toLowerCase()}`}>{selectedBookHousehold.riskLevel}</span><small>{selectedBookHousehold.serviceTier}</small></div><h2>{selectedBookHousehold.name}</h2><p>{selectedBookHousehold.primaryName}{selectedBookHousehold.partnerName ? ` and ${selectedBookHousehold.partnerName}` : ""}</p><dl><div><dt>Assets</dt><dd>{money.format(selectedBookHousehold.assets)}</dd></div><div><dt>Cash</dt><dd>{money.format(selectedBookHousehold.cashBalance)}</dd></div><div><dt>Open items</dt><dd>{selectedBookHousehold.openItems}</dd></div><div><dt>Plan status</dt><dd>{selectedBookHousehold.planStatus}</dd></div></dl><div className="tag-row">{selectedBookHousehold.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{selectedBookHousehold.linkedPlan ? <button className="button primary full-button" onClick={onOpenHousehold}>Open Client 360</button> : <small className="peek-note">Illustrative summary record. Detailed planning inputs are not loaded.</small>}</aside>
          </div>
        </>
      )}

      {mode === "service" && (
        <>
          <section className="service-launchers" aria-label="Controlled service requests">{[["Account packet", "Create and track an account-opening checklist", false], ["Distribution", "Prepare a distribution request for review", true], ["Wire or ACH", "Open a verified money-movement workflow", true], ["Trade review", "Stage a trade-review task; no order is created", true]].map(([title, description, approval]) => <article key={String(title)}><span>{approval ? "APPROVAL GATE" : "SERVICE"}</span><h3>{title}</h3><p>{description}</p><button disabled={busy} onClick={() => createControlledTask(`${title}: verify instructions and complete controlled workflow`, "Service", Boolean(approval))}>Create controlled request</button></article>)}</section>

          <div className="ops-grid">
            <section className="panel task-panel"><div className="panel-heading compact"><div><span className="step">MY WORK</span><h2>Priority queue</h2></div><span className="count-badge">{openTasks.length} open</span></div><div className="task-list">{householdTasks.map((task) => <label className={`task-row ${task.status === "completed" ? "done" : ""}`} key={task.id}><input type="checkbox" checked={task.status === "completed"} disabled={busy} onChange={() => postAction({ action: "toggle_task", id: task.id })} /><span><b>{task.title}</b><small><em>{task.dueLabel}</em> · {task.category}{task.requiresApproval ? " · Approval required" : ""}</small></span><i>{task.owner}</i></label>)}</div></section>
            <section className="panel activity-panel"><div className="panel-heading compact"><div><span className="step">ACTIVITY</span><h2>Household stream</h2></div><span className="live-dot" /></div><form className="quick-capture" onSubmit={submitCapture}><div>{(["Note", "Task", "Decision"] as CaptureType[]).map((type) => <button type="button" className={captureType === type ? "active" : ""} onClick={() => setCaptureType(type)} key={type}>{type}</button>)}</div><textarea aria-label={`Add ${captureType.toLowerCase()}`} maxLength={2000} placeholder={`Add ${captureType.toLowerCase()} to ${householdName}…`} value={captureText} onChange={(event) => setCaptureText(event.target.value)} /><button className="button primary" disabled={busy || !captureText.trim()} type="submit">{busy ? "Saving…" : `Add ${captureType.toLowerCase()}`}</button></form><ActivityList activities={householdActivities.slice(0, 6)} /></section>
            <section className="panel workflow-panel"><div className="panel-heading compact"><div><span className="step">WORKFLOW</span><h2>2026 income plan</h2></div><span className="muted">{workflow.filter((step) => step.status === "completed").length}/{workflow.length}</span></div><div className="workflow-progress"><i style={{ width: `${(workflow.filter((step) => step.status === "completed").length / Math.max(1, workflow.length)) * 100}%` }} /></div><div className="workflow-list">{workflow.map((step, index) => <label className={`${step.status === "completed" ? "done" : ""} ${index === nextWorkflow ? "next" : ""}`} key={step.id}><input type="checkbox" checked={step.status === "completed"} disabled={busy} onChange={() => postAction({ action: "toggle_workflow_step", id: step.id })} /><span><b>{step.title}</b>{index === nextWorkflow && <small>Next step</small>}{step.approvalType && <em>{step.approvalType}</em>}</span></label>)}</div><button className="button secondary full-button" onClick={onOpenPlanner}>Open planning engine</button></section>
          </div>

          <section className="panel pipeline-panel"><div className="panel-heading compact"><div><span className="step">PIPELINE</span><h2>Planning opportunities</h2></div><span className="muted">Illustrative AUM · {money.format(totalPipeline)}</span></div><div className="opportunity-table"><div className="opportunity-header"><span>Opportunity</span><span>Potential AUM</span><span>Stage</span><span>Owner</span></div>{workspace.opportunities.map((opportunity) => <div className="opportunity-row" key={opportunity.id}><b>{opportunity.name}</b><span>{money.format(opportunity.value)}</span><select aria-label={`${opportunity.name} stage`} disabled={busy} value={opportunity.stage} onChange={(event) => postAction({ action: "update_opportunity", id: opportunity.id, stage: event.target.value })}><option>Evaluation</option><option>Needs analysis</option><option>Review</option><option>Proposal</option><option>Won</option></select><i>{opportunity.owner}</i></div>)}</div></section>
        </>
      )}

      {mode === "household" && (
        <>
          <section className="household-hero"><div><span className="eyebrow">CLIENT 360 / PLANNING-LINKED</span><input aria-label="Household name" value={householdName} maxLength={120} onChange={(event) => setHouseholdName(event.target.value)} /><div className="tag-row"><span>Retirement planning</span><span>Annual review</span><span>Tax-sensitive</span></div></div><dl><div><dt>Relationship</dt><dd>Client · Illustrative</dd></div><div><dt>Service tier</dt><dd>{household.serviceTier}</dd></div><div><dt>Lead advisor</dt><dd>AS</dd></div><div><dt>Next review</dt><dd>{formatDate(household.nextReview)}</dd></div></dl></section>
          <div className="household-grid">
            <section className="panel member-panel"><div className="panel-heading compact"><div><span className="step">PEOPLE</span><h2>Household members</h2></div></div><article className="member-card"><span>PC</span><div><b>Primary client</b><small>Age 64 · Retiring 2027</small></div><em>Primary</em></article><article className="member-card"><span>SP</span><div><b>Partner</b><small>Age 61 · Spouse</small></div><em>Member</em></article><div className="record-details"><div><span>Email</span><b>Not entered</b></div><div><span>Phone</span><b>Not entered</b></div><div><span>CPA</span><b>Not assigned</b></div><div><span>Custodian</span><b>Not entered</b></div></div></section>
            <section className="panel financial-panel"><div className="panel-heading compact"><div><span className="step">FINANCIALS</span><h2>Planning-linked summary</h2></div><button className="text-button" onClick={onOpenPlanner}>Edit plan →</button></div><div className="financial-total"><span>Investable assets</span><strong>{money.format(totalAssets)}</strong></div><div className="allocation-bar" aria-label="Assets by tax treatment"><i style={{ width: `${(taxableAssets / Math.max(1, totalAssets)) * 100}%` }} /><i style={{ width: `${(taxDeferredAssets / Math.max(1, totalAssets)) * 100}%` }} /><i style={{ width: `${(taxFreeAssets / Math.max(1, totalAssets)) * 100}%` }} /></div><div className="tax-mix-list"><div><i className="taxable" /><span>Taxable</span><b>{money.format(taxableAssets)}</b></div><div><i className="deferred" /><span>Tax-deferred</span><b>{money.format(taxDeferredAssets)}</b></div><div><i className="free" /><span>Tax-free</span><b>{money.format(taxFreeAssets)}</b></div></div><div className="plan-kpis"><div><span>Modeled MAGI</span><b>{money.format(coordinatedMagi)}</b></div><div><span>Federal tax</span><b>{money.format(federalTax)}</b></div><div><span>Conversion screen</span><b>{money.format(conversionCapacity)}</b></div></div></section>
            <section className="panel governance-panel"><div className="panel-heading compact"><div><span className="step">CONTROL</span><h2>Human review gates</h2></div></div><div className="gate-card pending"><span>Planning candidate</span><b>Roth conversion range</b><small>Advisor and tax professional review required</small><em>Pending</em></div><div className="gate-card blocked"><span>Execution</span><b>Trade or money movement</b><small>Never generated or released from this workspace</small><em>Blocked</em></div><div className="gate-card ready"><span>Client communication</span><b>Draft recap</b><small>May be prepared after facts and decisions are verified</small><em>Ready</em></div></section>
          </div>

          <section className="meeting-workspace panel"><div className="panel-heading compact"><div><span className="step">MEETING WORKSPACE</span><h2>Prepare → document → follow up</h2></div><span className="approval-chip">Human approval required</span></div><div className="meeting-grid"><article><span>MEETING PREP</span><h3>Annual review · Aug 27</h3><ul><li>Confirm retirement timing and 2027 cash reserve</li><li>Review {money.format(conversionCapacity)} conversion screen</li><li>Resolve {openTasks.length} open service and planning items</li></ul><small>Built from the current household record. Verify before use.</small></article><article className="meeting-notes"><span>MANUAL NOTES</span><textarea aria-label="Meeting notes" maxLength={5000} placeholder="Record verified facts, decisions and next steps…" value={meetingNotes} onChange={(event) => setMeetingNotes(event.target.value)} /><button className="button secondary" disabled={!meetingNotes.trim()} onClick={() => setShowDraft(true)}>Build review draft</button></article><article className="meeting-draft"><span>FOLLOW-UP DRAFT</span>{showDraft ? <><p><b>Subject:</b> Review follow-up — {householdName}</p><p>Thank you for meeting with us. We documented the discussion below for your review:</p><blockquote>{meetingNotes}</blockquote><small>Draft only. Verify facts, disclosures and recipients before sending manually.</small><button className="button primary" disabled={busy} onClick={() => createControlledTask("Review meeting summary, verify decisions, and approve client recap", "Meeting follow-up", true)}>Create approval task</button></> : <p className="empty-state">Enter meeting notes to assemble a reviewable follow-up draft. Nothing is recorded or sent automatically.</p>}</article></div></section>

          <div className="household-lower-grid"><section className="panel"><div className="panel-heading compact"><div><span className="step">OPEN WORK</span><h2>Related tasks</h2></div><span className="count-badge">{openTasks.length}</span></div><div className="task-list compact-tasks">{openTasks.map((task) => <label className="task-row" key={task.id}><input type="checkbox" checked={false} disabled={busy} onChange={() => postAction({ action: "toggle_task", id: task.id })} /><span><b>{task.title}</b><small><em>{task.dueLabel}</em> · {task.category}{task.requiresApproval ? " · Approval required" : ""}</small></span><i>{task.owner}</i></label>)}</div></section><section className="panel"><div className="panel-heading compact"><div><span className="step">RECENT</span><h2>Activity and decisions</h2></div></div><ActivityList activities={householdActivities.slice(0, 5)} /></section></div>

          <section className="audit-panel panel"><div className="panel-heading compact"><div><span className="step">AUDIT</span><h2>Append-only change trail</h2></div><span className="muted">SHA-256 linked events</span></div>{workspace.auditEvents.length ? <div className="audit-list">{workspace.auditEvents.slice(0, 8).map((event) => <div key={event.id}><span>{event.eventType}</span><b>{event.entityType} · {event.entityId.slice(0, 12)}</b><small>{event.actor} · {dateTime.format(new Date(event.createdAt))}</small><code>{event.eventHash.slice(0, 16)}…</code></div>)}</div> : <p className="empty-state">The first controlled change will start the audit chain. Seeded illustrative records are read-only baseline data.</p>}</section>
        </>
      )}
    </>
  );
}

function ActivityList({ activities }: { activities: WorkspaceSnapshot["activities"] }) {
  return <div className="activity-list household-activity">{activities.map((activity) => <article key={activity.id}><span className={`activity-type ${activity.type.toLowerCase()}`}>{activity.type.slice(0, 1)}</span><div><p>{activity.detail}</p><small>{activity.actor} · {dateTime.format(new Date(activity.occurredAt))}</small></div></article>)}</div>;
}
