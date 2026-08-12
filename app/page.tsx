"use client";

import { useMemo, useRef, useState } from "react";
import {
  bracketCeiling,
  calculateFederalTax,
  estimateRmd,
  FilingStatus,
  irmaaPartBSurcharges,
  irmaaThresholds,
  irmaaTier,
  socialSecurityFactor,
} from "../lib/tax2026";
import AdvisorWorkspace from "./components/AdvisorWorkspace";
import KnowledgeSearch from "./components/KnowledgeSearch";

type AccountType = "Taxable" | "Tax-deferred" | "Tax-free";
type AppView = "book" | "service" | "household" | "planner";

type Account = {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  basis: number;
  priorYearEnd: number;
};

type Plan = {
  taxable: number;
  deferred: number;
  roth: number;
  longTermGains: number;
  tax: ReturnType<typeof calculateFederalTax>;
  surplus: number;
};

type SavedScenario = {
  householdName: string;
  accounts: Account[];
  spending: number;
  ordinaryIncome: number;
  socialSecurity: number;
  clientAge: number;
  partnerAge: number;
  rmdStartAge: 73 | 75;
  status: FilingStatus;
  targetRate: number;
  respectIrmaa: boolean;
  clientPia: number;
  partnerPia: number;
  clientFra: number;
  partnerFra: number;
  clientClaimAge: number;
  partnerClaimAge: number;
  clientLongevity: number;
  partnerLongevity: number;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const statusLabels: Record<FilingStatus, string> = {
  mfj: "Married filing jointly",
  single: "Single",
  hoh: "Head of household",
  mfs: "Married filing separately",
};

const initialAccounts: Account[] = [
  { id: 1, name: "Joint brokerage", type: "Taxable", balance: 850000, basis: 560000, priorYearEnd: 0 },
  { id: 2, name: "Traditional IRA", type: "Tax-deferred", balance: 1450000, basis: 0, priorYearEnd: 1450000 },
  { id: 3, name: "Roth IRA", type: "Tax-free", balance: 300000, basis: 300000, priorYearEnd: 0 },
];

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        {prefix && <b>{prefix}</b>}
        <input
          aria-label={label}
          min={min}
          max={max}
          type="number"
          value={value || ""}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <b>{suffix}</b>}
      </div>
    </label>
  );
}

function allocatePlan(
  order: AccountType[],
  inputs: {
    spending: number;
    ordinaryIncome: number;
    socialSecurity: number;
    status: FilingStatus;
    clientAge: number;
    partnerAge: number;
    balances: Record<AccountType, number>;
    taxableBasis: number;
    rmd: number;
  },
): Plan {
  let federalTax = 0;
  let plan: Plan | undefined;
  const baseGap = Math.max(0, inputs.spending - inputs.ordinaryIncome - inputs.socialSecurity);
  const gainRatio = inputs.balances.Taxable
    ? Math.max(0, 1 - inputs.taxableBasis / inputs.balances.Taxable)
    : 0;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const withdrawals: Record<AccountType, number> = {
      Taxable: 0,
      "Tax-deferred": Math.min(inputs.rmd, inputs.balances["Tax-deferred"]),
      "Tax-free": 0,
    };
    let remaining = Math.max(0, baseGap + federalTax - withdrawals["Tax-deferred"]);

    for (const type of order) {
      const capacity = Math.max(0, inputs.balances[type] - withdrawals[type]);
      const amount = Math.min(capacity, remaining);
      withdrawals[type] += amount;
      remaining -= amount;
    }

    const longTermGains = withdrawals.Taxable * gainRatio;
    const tax = calculateFederalTax({
      filingStatus: inputs.status,
      clientAge: inputs.clientAge,
      partnerAge: inputs.partnerAge,
      ordinaryIncome: inputs.ordinaryIncome,
      iraDistributions: withdrawals["Tax-deferred"],
      socialSecurity: inputs.socialSecurity,
      longTermGains,
      netInvestmentIncome: longTermGains,
    });
    const totalCash = inputs.ordinaryIncome + inputs.socialSecurity + Object.values(withdrawals).reduce((sum, value) => sum + value, 0);

    plan = {
      taxable: withdrawals.Taxable,
      deferred: withdrawals["Tax-deferred"],
      roth: withdrawals["Tax-free"],
      longTermGains,
      tax,
      surplus: Math.max(0, totalCash - tax.federalTax - inputs.spending),
    };

    if (Math.abs(tax.federalTax - federalTax) < 1) break;
    federalTax = tax.federalTax;
  }

  return plan!;
}

function ssProjection(pia: number, claimAge: number, lifeExpectancy: number, fullRetirementAge: number) {
  const annual = pia * socialSecurityFactor(claimAge, fullRetirementAge) * 12;
  return { annual, lifetime: annual * Math.max(0, lifeExpectancy - claimAge + 1) };
}

function bestClaimAge(pia: number, lifeExpectancy: number, fullRetirementAge: number) {
  let best = { age: 62, value: 0 };
  for (let age = 62; age <= 70; age += 1) {
    const value = ssProjection(pia, age, lifeExpectancy, fullRetirementAge).lifetime;
    if (value > best.value) best = { age, value };
  }
  return best.age;
}

export default function Home() {
  const resultsRef = useRef<HTMLElement>(null);
  const [householdName, setHouseholdName] = useState("Sample household");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [spending, setSpending] = useState(160000);
  const [ordinaryIncome, setOrdinaryIncome] = useState(38000);
  const [socialSecurity, setSocialSecurity] = useState(0);
  const [clientAge, setClientAge] = useState(64);
  const [partnerAge, setPartnerAge] = useState(61);
  const [rmdStartAge, setRmdStartAge] = useState<73 | 75>(75);
  const [status, setStatus] = useState<FilingStatus>("mfj");
  const [targetRate, setTargetRate] = useState(.22);
  const [respectIrmaa, setRespectIrmaa] = useState(true);
  const [clientPia, setClientPia] = useState(3200);
  const [partnerPia, setPartnerPia] = useState(2100);
  const [clientFra, setClientFra] = useState(67);
  const [partnerFra, setPartnerFra] = useState(67);
  const [clientClaimAge, setClientClaimAge] = useState(70);
  const [partnerClaimAge, setPartnerClaimAge] = useState(67);
  const [clientLongevity, setClientLongevity] = useState(90);
  const [partnerLongevity, setPartnerLongevity] = useState(93);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeView, setActiveView] = useState<AppView>("book");

  const applyScenario = (scenario: SavedScenario) => {
    setHouseholdName(scenario.householdName);
    setAccounts(scenario.accounts);
    setSpending(scenario.spending);
    setOrdinaryIncome(scenario.ordinaryIncome);
    setSocialSecurity(scenario.socialSecurity);
    setClientAge(scenario.clientAge);
    setPartnerAge(scenario.partnerAge);
    setRmdStartAge(scenario.rmdStartAge);
    setStatus(scenario.status);
    setTargetRate(scenario.targetRate);
    setRespectIrmaa(scenario.respectIrmaa);
    setClientPia(scenario.clientPia);
    setPartnerPia(scenario.partnerPia);
    setClientFra(scenario.clientFra);
    setPartnerFra(scenario.partnerFra);
    setClientClaimAge(scenario.clientClaimAge);
    setPartnerClaimAge(scenario.partnerClaimAge);
    setClientLongevity(scenario.clientLongevity);
    setPartnerLongevity(scenario.partnerLongevity);
  };

  const totals = useMemo(() => {
    const byType: Record<AccountType, number> = { Taxable: 0, "Tax-deferred": 0, "Tax-free": 0 };
    let taxableBasis = 0;
    let priorYearEndDeferred = 0;
    for (const account of accounts) {
      byType[account.type] += account.balance;
      if (account.type === "Taxable") taxableBasis += Math.min(account.balance, account.basis);
      if (account.type === "Tax-deferred") priorYearEndDeferred += account.priorYearEnd;
    }
    const total = Object.values(byType).reduce((sum, value) => sum + value, 0);
    return { byType, total, taxableBasis, priorYearEndDeferred };
  }, [accounts]);

  const rmd = estimateRmd(clientAge, totals.priorYearEndDeferred, rmdStartAge);
  const sharedInputs = {
    spending,
    ordinaryIncome,
    socialSecurity,
    status,
    clientAge,
    partnerAge,
    balances: totals.byType,
    taxableBasis: totals.taxableBasis,
    rmd,
  };
  const coordinated = allocatePlan(["Taxable", "Tax-deferred", "Tax-free"], sharedInputs);
  const conventional = allocatePlan(["Tax-deferred", "Taxable", "Tax-free"], sharedInputs);
  const currentYearSavings = Math.max(0, conventional.tax.federalTax - coordinated.tax.federalTax);
  const tier = irmaaTier(coordinated.tax.magi, status);
  const firstIrmaa = irmaaThresholds[status][0];
  const medicareEligible = (clientAge >= 65 ? 1 : 0) + (status === "mfj" && partnerAge >= 65 ? 1 : 0);
  const monthlyPartB = 202.9 + irmaaPartBSurcharges[status][tier];

  const conversionCapacity = (() => {
    const available = Math.max(0, totals.byType["Tax-deferred"] - coordinated.deferred);
    const ceiling = bracketCeiling(status, targetRate);
    const irmaaCeiling = irmaaThresholds[status][0];
    let low = 0;
    let high = available;
    for (let i = 0; i < 32; i += 1) {
      const conversion = (low + high) / 2;
      const tax = calculateFederalTax({
        filingStatus: status,
        clientAge,
        partnerAge,
        ordinaryIncome,
        iraDistributions: coordinated.deferred,
        rothConversion: conversion,
        socialSecurity,
        longTermGains: coordinated.longTermGains,
      });
      const insideBracket = tax.ordinaryTaxable <= ceiling;
      const insideIrmaa = !respectIrmaa || tax.magi <= irmaaCeiling;
      if (insideBracket && insideIrmaa) low = conversion;
      else high = conversion;
    }
    return Math.floor(low / 100) * 100;
  })();

  const conversionTax = calculateFederalTax({
    filingStatus: status,
    clientAge,
    partnerAge,
    ordinaryIncome,
    iraDistributions: coordinated.deferred,
    rothConversion: conversionCapacity,
    socialSecurity,
    longTermGains: coordinated.longTermGains,
  }).federalTax - coordinated.tax.federalTax;

  const clientSs = ssProjection(clientPia, clientClaimAge, clientLongevity, clientFra);
  const partnerSs = ssProjection(partnerPia, partnerClaimAge, partnerLongevity, partnerFra);
  const accountMix = [
    { label: "Taxable", value: totals.byType.Taxable, color: "#ee6f57" },
    { label: "Tax-deferred", value: totals.byType["Tax-deferred"], color: "#163954" },
    { label: "Tax-free", value: totals.byType["Tax-free"], color: "#5aa897" },
  ];

  const updateAccount = (id: number, changes: Partial<Account>) => {
    setAccounts((current) => current.map((account) => account.id === id ? { ...account, ...changes } : account));
  };

  const scenario = () => ({
      householdName, accounts, spending, ordinaryIncome, socialSecurity, clientAge, partnerAge, rmdStartAge, status,
      targetRate, respectIrmaa, clientPia, partnerPia, clientFra, partnerFra, clientClaimAge, partnerClaimAge,
      clientLongevity, partnerLongevity,
  });

  const saveScenario = async () => {
    setSaveState("saving");
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_planner", scenario: scenario() }) });
      if (!response.ok) throw new Error("Save failed");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
    }
  };

  const loadScenario = async () => {
    setSaveState("saving");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (!response.ok) throw new Error("Load failed");
      const snapshot = await response.json() as { plannerScenario?: SavedScenario | null };
      if (snapshot.plannerScenario) applyScenario(snapshot.plannerScenario);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Advisor workspace"><span>AW</span></div>
        <nav aria-label="Primary navigation">
          <button className={`nav-item ${activeView === "book" ? "active" : ""}`} aria-label="Book 360" title="Book 360" onClick={() => setActiveView("book")}><i className="icon grid-icon" /></button>
          <button className={`nav-item ${activeView === "service" ? "active" : ""}`} aria-label="Service workspace" title="Service workspace" onClick={() => setActiveView("service")}><i className="icon service-icon" /></button>
          <button className={`nav-item ${activeView === "household" ? "active" : ""}`} aria-label="Client 360" title="Client 360" onClick={() => setActiveView("household")}><i className="icon people-icon" /></button>
          <button className={`nav-item ${activeView === "planner" ? "active" : ""}`} aria-label="Tax planning engine" title="Tax planning engine" onClick={() => setActiveView("planner")}><i className="icon report-icon" /></button>
        </nav>
        <button className="avatar" aria-label="Advisor profile">AS</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">ADVISOR WORKSPACE / {activeView === "book" ? "BOOK 360" : activeView === "service" ? "SERVICE" : activeView === "household" ? "CLIENT 360" : "PLANNING"}</p>
            <h1>{activeView === "book" ? "Client Engagement Workspace" : activeView === "service" ? "Service & Work Management" : activeView === "household" ? householdName : "Tax-Smart Income Planner"}</h1>
          </div>
          <div className="top-actions">
            <KnowledgeSearch />
            {activeView === "planner" ? (
              <>
                <span className="status-pill"><i /> 2026 federal rules</span>
                <button className="button secondary load-button" onClick={loadScenario}>Load saved</button>
                <button className="button secondary" onClick={saveScenario}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved securely" : saveState === "error" ? "Save failed" : "Save scenario"}</button>
                <button className="button primary" onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth" })}>Generate action plan</button>
              </>
            ) : (
              <>
                <span className="status-pill"><i /> Private workspace</span>
                {activeView !== "book" && <button className="button secondary" onClick={() => setActiveView("book")}>Back to Book 360</button>}
                {activeView === "book" && <button className="button secondary" onClick={() => setActiveView("service")}>Open work queue</button>}
                <button className="button primary" onClick={() => setActiveView(activeView === "household" ? "planner" : "household")}>{activeView === "household" ? "Open tax plan" : "Open active client"}</button>
              </>
            )}
          </div>
        </header>

        {activeView === "planner" ? (
        <>
        <div className="case-banner">
          <div>
            <span className="case-tag">ILLUSTRATIVE CASE</span>
            <input className="household-name" aria-label="Household name" value={householdName} onChange={(event) => setHouseholdName(event.target.value)} />
            <small>Replace every field with verified client data before use.</small>
          </div>
          <div className="case-meta"><span>Federal model</span><b>Tax year 2026</b></div>
        </div>

        <div className="dashboard-grid">
          <section className="panel setup-panel">
            <div className="panel-heading">
              <div><span className="step">01</span><h2>Household setup</h2></div>
              <span className="muted">Current-year cash flow</span>
            </div>
            <div className="three-col age-row">
              <Field label="Client age" value={clientAge} onChange={setClientAge} suffix="yrs" min={18} max={120} />
              <Field label="Partner age" value={partnerAge} onChange={setPartnerAge} suffix="yrs" min={18} max={120} />
              <label className="field">
                <span>RMD start age</span>
                <select value={rmdStartAge} onChange={(event) => setRmdStartAge(Number(event.target.value) as 73 | 75)}>
                  <option value={73}>73</option><option value={75}>75</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Filing status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as FilingStatus)}>
                {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <div className="three-col">
              <Field label="Spending" value={spending} onChange={setSpending} prefix="$" />
              <Field label="Pension / ordinary" value={ordinaryIncome} onChange={setOrdinaryIncome} prefix="$" />
              <Field label="Social Security" value={socialSecurity} onChange={setSocialSecurity} prefix="$" />
            </div>
            <div className="gap-card">
              <span>Pre-tax portfolio gap</span>
              <strong>{money.format(Math.max(0, spending - ordinaryIncome - socialSecurity))}</strong>
              <small>Federal tax is grossed up in the sourcing plan</small>
            </div>
          </section>

          <section className="panel account-panel">
            <div className="panel-heading">
              <div><span className="step">02</span><h2>Household accounts</h2></div>
              <button className="text-button" onClick={() => setAccounts((current) => [...current, { id: Date.now(), name: "Additional account", type: "Taxable", balance: 0, basis: 0, priorYearEnd: 0 }])}>+ Add account</button>
            </div>
            <div className="account-list">
              {accounts.map((account) => (
                <div className="account-row expanded" key={account.id}>
                  <span className={`account-dot ${account.type.toLowerCase().replace("-", "")}`} />
                  <div className="account-identity">
                    <input className="account-name" aria-label={`${account.name} name`} value={account.name} onChange={(event) => updateAccount(account.id, { name: event.target.value })} />
                    <select aria-label={`${account.name} tax type`} value={account.type} onChange={(event) => updateAccount(account.id, { type: event.target.value as AccountType })}>
                      <option>Taxable</option><option>Tax-deferred</option><option>Tax-free</option>
                    </select>
                  </div>
                  <label><span>Balance</span><input aria-label={`${account.name} balance`} type="number" value={account.balance || ""} onChange={(event) => updateAccount(account.id, { balance: Number(event.target.value) })} /></label>
                  {account.type === "Taxable" && <label><span>Basis</span><input aria-label={`${account.name} basis`} type="number" value={account.basis || ""} onChange={(event) => updateAccount(account.id, { basis: Number(event.target.value) })} /></label>}
                  {account.type === "Tax-deferred" && <label><span>Prior 12/31</span><input aria-label={`${account.name} prior year-end balance`} type="number" value={account.priorYearEnd || ""} onChange={(event) => updateAccount(account.id, { priorYearEnd: Number(event.target.value) })} /></label>}
                  {accounts.length > 1 && <button className="remove-account" aria-label={`Remove ${account.name}`} onClick={() => setAccounts((current) => current.filter((item) => item.id !== account.id))}>×</button>}
                </div>
              ))}
            </div>
            <div className="account-total"><span>Total investable assets</span><strong>{money.format(totals.total)}</strong></div>
          </section>

          <section className="panel snapshot-panel">
            <div className="panel-heading compact">
              <div><span className="step">LIVE</span><h2>Planning snapshot</h2></div><span className="live-dot" />
            </div>
            <div className="mix-visual" aria-label="Tax treatment mix">
              <div className="donut" style={{ background: totals.total ? `conic-gradient(#163954 0 ${(totals.byType["Tax-deferred"] / totals.total) * 100}%, #5aa897 0 ${((totals.byType["Tax-deferred"] + totals.byType["Tax-free"]) / totals.total) * 100}%, #ee6f57 0)` : "#e9ecef" }}>
                <div><span>Assets</span><strong>{compactMoney.format(totals.total)}</strong></div>
              </div>
              <div className="legend">
                {accountMix.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{totals.total ? Math.round((item.value / totals.total) * 100) : 0}%</b></div>)}
              </div>
            </div>
            <div className="metric-stack">
              <div><span>Estimated RMD</span><b>{rmd ? money.format(rmd) : "Not required"}</b></div>
              <div><span>Coordinated MAGI</span><b>{money.format(coordinated.tax.magi)}</b></div>
              <div><span>Marginal bracket</span><b>{Math.round(coordinated.tax.marginalRate * 100)}%</b></div>
            </div>
            <div className="signal-card warning">
              <span className="signal-kicker">FIRST READ</span>
              <strong>{Math.round((totals.byType["Tax-deferred"] / Math.max(1, totals.total)) * 100)}% sits in tax-deferred accounts.</strong>
              <p>{clientAge < rmdStartAge ? `There are ${rmdStartAge - clientAge} years before the selected RMD start age. Test bracket-filling conversions now.` : "RMDs constrain the first dollars of the withdrawal plan."}</p>
            </div>
          </section>
        </div>

        <section className="results" ref={resultsRef}>
          <div className="section-title">
            <div><p className="eyebrow">DECISION ENGINE</p><h2>2026 action plan</h2></div>
            <button className="button secondary" onClick={() => window.print()}>Print plan</button>
          </div>

          <div className="result-grid">
            <article className="result-card withdrawal-card">
              <div className="result-heading"><span>01</span><div><h3>Withdrawal sourcing</h3><p>Same after-tax spending target, two current-year sequences</p></div></div>
              <div className="comparison-callout">
                <div><small>Current-year tax difference</small><strong>{money.format(currentYearSavings)}</strong></div>
                <p>Not a lifetime tax-savings claim. Future returns, state tax and estate goals can reverse the ranking.</p>
              </div>
              <div className="plan-table">
                <div className="plan-row header"><span>Source</span><b>Coordinated</b><b>IRA-first</b></div>
                <div className="plan-row"><span><i className="source-dot taxable" />Taxable account</span><b>{money.format(coordinated.taxable)}</b><b>{money.format(conventional.taxable)}</b></div>
                <div className="plan-row"><span><i className="source-dot deferred" />Tax-deferred</span><b>{money.format(coordinated.deferred)}</b><b>{money.format(conventional.deferred)}</b></div>
                <div className="plan-row"><span><i className="source-dot free" />Tax-free</span><b>{money.format(coordinated.roth)}</b><b>{money.format(conventional.roth)}</b></div>
                <div className="plan-row total"><span>Estimated federal tax</span><b>{money.format(coordinated.tax.federalTax)}</b><b>{money.format(conventional.tax.federalTax)}</b></div>
              </div>
              <p className="fine-print">Taxable sales assume gains are realized pro rata to the basis entered. Selective-lot sales may produce a materially different result.</p>
            </article>

            <article className="result-card conversion-card">
              <div className="result-heading"><span>02</span><div><h3>Roth conversion window</h3><p>Capacity before the selected guardrail</p></div></div>
              <div className="toggle-row">
                <label>Top bracket
                  <select value={targetRate} onChange={(event) => setTargetRate(Number(event.target.value))}>
                    <option value={.12}>12%</option><option value={.22}>22%</option><option value={.24}>24%</option><option value={.32}>32%</option>
                  </select>
                </label>
                <label className="check"><input type="checkbox" checked={respectIrmaa} onChange={(event) => setRespectIrmaa(event.target.checked)} /> Hold below first IRMAA reference cliff</label>
              </div>
              <div className="conversion-number"><span>Screened conversion capacity</span><strong>{money.format(conversionCapacity)}</strong><small>Estimated incremental federal tax: {money.format(Math.max(0, conversionTax))}</small></div>
              <div className="cliff-track">
                <div className="track-labels"><span>Estimated MAGI {money.format(coordinated.tax.magi)}</span><span>2026 IRMAA ref. {money.format(firstIrmaa)}</span></div>
                <div className="track"><i style={{ width: `${Math.min(100, (coordinated.tax.magi / Math.max(1, firstIrmaa)) * 100)}%` }} /><b /></div>
              </div>
              <div className="irmaa-box">
                <span>IRMAA reference tier</span><strong>{tier === 0 ? "Below first tier" : `Tier ${tier}`}</strong>
                <small>{medicareEligible ? `${money.format(monthlyPartB)} monthly Part B per covered person using 2026 premiums` : "No household member is currently Medicare-age"}</small>
              </div>
              <p className="fine-print">A 2026 return generally affects 2028 Medicare premiums; 2028 thresholds are not published. The 2026 cliff shown here is a stress-test reference, not a forecast.</p>
            </article>

            <article className="result-card social-card">
              <div className="result-heading"><span>03</span><div><h3>Social Security timing</h3><p>SSA reduction and delayed-credit factors</p></div></div>
              <div className="ss-person">
                <div><b>Client</b><span>Benefit at FRA</span></div>
                <label>$<input aria-label="Client monthly benefit at full retirement age" type="number" value={clientPia} onChange={(event) => setClientPia(Number(event.target.value))} />/mo</label>
                <label>FRA <select aria-label="Client full retirement age" value={clientFra} onChange={(event) => setClientFra(Number(event.target.value))}><option value={66}>66</option><option value={66.5}>66½</option><option value={67}>67</option></select></label>
                <label>Claim <input aria-label="Client claim age" type="range" min="62" max="70" value={clientClaimAge} onChange={(event) => setClientClaimAge(Number(event.target.value))} /><b>{clientClaimAge}</b></label>
                <label>Plan to <input aria-label="Client life expectancy" type="number" min="62" max="120" value={clientLongevity} onChange={(event) => setClientLongevity(Number(event.target.value))} /></label>
                <strong>{money.format(clientSs.annual)} / year</strong>
              </div>
              <div className="ss-person">
                <div><b>Partner</b><span>Benefit at FRA</span></div>
                <label>$<input aria-label="Partner monthly benefit at full retirement age" type="number" value={partnerPia} onChange={(event) => setPartnerPia(Number(event.target.value))} />/mo</label>
                <label>FRA <select aria-label="Partner full retirement age" value={partnerFra} onChange={(event) => setPartnerFra(Number(event.target.value))}><option value={66}>66</option><option value={66.5}>66½</option><option value={67}>67</option></select></label>
                <label>Claim <input aria-label="Partner claim age" type="range" min="62" max="70" value={partnerClaimAge} onChange={(event) => setPartnerClaimAge(Number(event.target.value))} /><b>{partnerClaimAge}</b></label>
                <label>Plan to <input aria-label="Partner life expectancy" type="number" min="62" max="120" value={partnerLongevity} onChange={(event) => setPartnerLongevity(Number(event.target.value))} /></label>
                <strong>{money.format(partnerSs.annual)} / year</strong>
              </div>
              <div className="ss-readout"><span>Undiscounted single-life screen</span><b>Client age {bestClaimAge(clientPia, clientLongevity, clientFra)} · Partner age {bestClaimAge(partnerPia, partnerLongevity, partnerFra)}</b></div>
              <p className="fine-print">This screen excludes spousal and survivor coordination, earnings tests, COLAs, taxes, discounting and benefit-rule changes. It is not a filing recommendation.</p>
            </article>
          </div>

          <div className="action-strip">
            <div className="action-intro"><span>NEXT BEST ACTIONS</span><h3>Advisor checklist</h3></div>
            <ol>
              <li><b>Verify the inputs.</b><span>Confirm prior year-end IRA values, taxable lots, pension withholding and Social Security statements.</span></li>
              <li><b>Test the conversion.</b><span>Model {money.format(conversionCapacity)} against state tax, 2028 IRMAA sensitivity and charitable giving before execution.</span></li>
              <li><b>Source the cash.</b><span>Raise {money.format(coordinated.taxable)} taxable, {money.format(coordinated.deferred)} tax-deferred and {money.format(coordinated.roth)} Roth in this screen.</span></li>
              <li><b>Re-run before trade date.</b><span>Update realized gains, year-to-date income and any client-directed cash changes.</span></li>
            </ol>
          </div>
        </section>

        <footer className="model-note expanded-note">
          <span>Planning estimate only</span>
          <p>Models federal ordinary-income brackets, standard and senior deductions, Social Security taxation, long-term capital gains, NIIT, RMDs and 2026 IRMAA reference tiers. Excludes state tax, AMT, QCDs, credits, annuities, inherited accounts, security-level optimization and multi-year return paths.</p>
          <div className="source-links">
            <a href="https://www.irs.gov/pub/irs-drop/rp-25-32.pdf" target="_blank" rel="noreferrer">IRS 2026 brackets</a>
            <a href="https://www.irs.gov/publications/p915" target="_blank" rel="noreferrer">IRS Social Security tax</a>
            <a href="https://www.ssa.gov/benefits/medicare/medicare-premiums.html" target="_blank" rel="noreferrer">SSA 2026 IRMAA</a>
            <a href="https://www.irs.gov/publications/p590b" target="_blank" rel="noreferrer">IRS RMD tables</a>
            <a href="https://www.irs.gov/irb/2024-33_IRB" target="_blank" rel="noreferrer">IRS RMD start ages</a>
          </div>
        </footer>
        </>
        ) : (
          <AdvisorWorkspace
            mode={activeView as "book" | "service" | "household"}
            householdName={householdName}
            setHouseholdName={setHouseholdName}
            totalAssets={totals.total}
            taxableAssets={totals.byType.Taxable}
            taxDeferredAssets={totals.byType["Tax-deferred"]}
            taxFreeAssets={totals.byType["Tax-free"]}
            coordinatedMagi={coordinated.tax.magi}
            conversionCapacity={conversionCapacity}
            federalTax={coordinated.tax.federalTax}
            onOpenPlanner={() => setActiveView("planner")}
            onOpenHousehold={() => setActiveView("household")}
          />
        )}
      </section>
    </main>
  );
}
