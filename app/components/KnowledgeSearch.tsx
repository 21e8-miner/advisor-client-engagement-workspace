"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const articles = [
  { title: "Required minimum distributions", keywords: ["rmd", "required minimum", "distribution", "age 73", "age 75"], answer: "RMD start age depends on date of birth. Confirm the account type, owner, prior year-end balance and applicable IRS life-expectancy table before calculating or servicing a distribution.", source: "IRS Publication 590-B", href: "https://www.irs.gov/publications/p590b", control: "Planning and service review required" },
  { title: "Inherited IRA service screen", keywords: ["inherited ira", "beneficiary", "10 year", "secure act"], answer: "Inherited-account rules depend on the decedent, beneficiary class, death date and whether required distributions had begun. Do not infer a payout schedule from the account title alone.", source: "IRS Retirement Plan FAQs", href: "https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-required-minimum-distributions", control: "Tax-professional escalation recommended" },
  { title: "IRMAA planning reference", keywords: ["irmaa", "medicare", "magi", "premium"], answer: "Medicare income-related surcharges generally use tax data from two years earlier. Published thresholds are planning references, not guarantees for a future premium year.", source: "Social Security Administration", href: "https://www.ssa.gov/benefits/medicare/medicare-premiums.html", control: "Verify premium year and filing status" },
  { title: "Roth conversion review", keywords: ["roth", "conversion", "bracket", "tax"], answer: "A conversion screen should test federal and state tax, Medicare impacts, charitable strategies, liquidity for tax payment and the multi-year plan. The model output is not an execution instruction.", source: "IRS Roth IRA guidance", href: "https://www.irs.gov/retirement-plans/roth-iras", control: "Advisor and tax-professional review required" },
  { title: "Money-movement control", keywords: ["wire", "ach", "transfer", "money movement", "distribution request"], answer: "Treat any new or changed money-movement instruction as a controlled service request. Independently verify client identity, destination instructions, authority and required approvals before using the custodian workflow.", source: "Internal control pattern", href: "https://www.finra.org/rules-guidance/key-topics/customer-account-transfers", control: "Execution is blocked in this workspace" },
  { title: "Client recap workflow", keywords: ["meeting", "recap", "follow up", "email", "notes"], answer: "Separate verified facts, client decisions, advisor recommendations and open questions. Confirm recipients and required disclosures before sending the reviewed draft through an approved communication channel.", source: "Workspace governance", href: "https://www.finra.org/rules-guidance/key-topics/books-records", control: "Manual review and send only" },
];

export default function KnowledgeSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(focusTimer); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return articles.slice(0, 3);
    return articles
      .map((article) => ({ article, score: terms.reduce((score, term) => score + ([article.title, article.answer, ...article.keywords].join(" ").toLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.article);
  }, [query]);

  return <>
    <button className="button secondary knowledge-trigger" onClick={() => setOpen(true)}><i /> Knowledge search</button>
    {open && <div className="knowledge-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className="knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-title">
        <header><div><span>CURATED OPERATIONS SEARCH</span><h2 id="knowledge-title">Ask the workspace</h2></div><button aria-label="Close knowledge search" onClick={() => setOpen(false)}>×</button></header>
        <label className="knowledge-input"><span>Question or topic</span><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “inherited IRA” or “wire verification”" /></label>
        <div className="knowledge-suggestions">{["Inherited IRA", "IRMAA", "Money movement", "Meeting recap"].map((suggestion) => <button onClick={() => setQuery(suggestion)} key={suggestion}>{suggestion}</button>)}</div>
        <div className="knowledge-results" aria-live="polite">
          {results.length ? results.map((article) => <article key={article.title}><span>CONTROLLED ANSWER</span><h3>{article.title}</h3><p>{article.answer}</p><div><b>{article.control}</b><a href={article.href} target="_blank" rel="noreferrer">{article.source} ↗</a></div></article>) : <p className="empty-state">No curated answer matched. Create a research task instead of improvising a client answer.</p>}
        </div>
        <footer>Curated reference search · not client-specific advice · no external AI call</footer>
      </section>
    </div>}
  </>;
}
