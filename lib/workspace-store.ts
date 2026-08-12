import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activities, auditEvents, households, opportunities, plannerScenarios, tasks, workflowSteps } from "@/db/schema";
import { seedActivities, seedHouseholds, seedOpportunities, seedTasks, seedWorkflowSteps } from "./workspace-seed";
import type { WorkspaceSnapshot } from "./workspace-types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, primary_name TEXT NOT NULL, partner_name TEXT, service_tier TEXT NOT NULL, assets INTEGER NOT NULL, cash_balance INTEGER NOT NULL, next_review TEXT NOT NULL, last_contact TEXT NOT NULL, plan_status TEXT NOT NULL, risk_level TEXT NOT NULL, tags_json TEXT NOT NULL, open_items INTEGER NOT NULL, linked_plan INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS households_next_review_idx ON households (next_review)`,
  `CREATE INDEX IF NOT EXISTS households_risk_level_idx ON households (risk_level)`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, title TEXT NOT NULL, due_date TEXT NOT NULL, due_label TEXT NOT NULL, owner TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL, requires_approval INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS tasks_household_idx ON tasks (household_id)`,
  `CREATE INDEX IF NOT EXISTS tasks_status_due_idx ON tasks (status, due_date)`,
  `CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL, actor TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS activities_household_time_idx ON activities (household_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS opportunities (id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, name TEXT NOT NULL, value INTEGER NOT NULL, stage TEXT NOT NULL, owner TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS opportunities_stage_idx ON opportunities (stage)`,
  `CREATE TABLE IF NOT EXISTS workflow_steps (id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, workflow_name TEXT NOT NULL, sequence INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, approval_type TEXT, completed_by TEXT, completed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS workflow_household_sequence_idx ON workflow_steps (household_id, sequence)`,
  `CREATE TABLE IF NOT EXISTS planner_scenarios (household_id TEXT PRIMARY KEY NOT NULL, scenario_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER DEFAULT 1 NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, actor TEXT NOT NULL, payload_json TEXT NOT NULL, previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events (created_at)`,
];

let initialized: Promise<void> | null = null;

async function ensureWorkspace() {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = getDb();
    const d1 = db.$client;
    await d1.batch(schemaStatements.map((statement) => d1.prepare(statement)));

    await db.insert(households).values(seedHouseholds.map((household) => ({
      ...household,
      tagsJson: JSON.stringify(household.tags),
      createdAt: "2026-08-12T13:00:00.000Z",
      updatedAt: "2026-08-12T13:00:00.000Z",
    }))).onConflictDoNothing().run();
    await db.insert(tasks).values(seedTasks).onConflictDoNothing().run();
    await db.insert(activities).values(seedActivities).onConflictDoNothing().run();
    await db.insert(opportunities).values(seedOpportunities).onConflictDoNothing().run();
    await db.insert(workflowSteps).values(seedWorkflowSteps).onConflictDoNothing().run();
  })().catch((error) => {
    initialized = null;
    throw error;
  });
  return initialized;
}

function safeTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export async function readWorkspace(): Promise<WorkspaceSnapshot> {
  await ensureWorkspace();
  const db = getDb();
  const [householdRows, taskRows, activityRows, opportunityRows, stepRows, auditRows, scenarioRows] = await Promise.all([
    db.select().from(households).orderBy(desc(households.assets)),
    db.select().from(tasks).orderBy(asc(tasks.status), asc(tasks.dueDate)),
    db.select().from(activities).orderBy(desc(activities.occurredAt)).limit(100),
    db.select().from(opportunities).orderBy(desc(opportunities.value)),
    db.select().from(workflowSteps).orderBy(asc(workflowSteps.sequence)),
    db.select({ id: auditEvents.id, eventType: auditEvents.eventType, entityType: auditEvents.entityType, entityId: auditEvents.entityId, actor: auditEvents.actor, eventHash: auditEvents.eventHash, createdAt: auditEvents.createdAt }).from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(30),
    db.select().from(plannerScenarios).where(eq(plannerScenarios.householdId, "household-1")).limit(1),
  ]);

  let plannerScenario: unknown | null = null;
  if (scenarioRows[0]) {
    try { plannerScenario = JSON.parse(scenarioRows[0].scenarioJson); } catch { plannerScenario = null; }
  }

  return {
    households: householdRows.map((row) => ({
      id: row.id,
      name: row.name,
      primaryName: row.primaryName,
      partnerName: row.partnerName,
      serviceTier: row.serviceTier,
      assets: row.assets,
      cashBalance: row.cashBalance,
      nextReview: row.nextReview,
      lastContact: row.lastContact,
      planStatus: row.planStatus,
      riskLevel: row.riskLevel as "Low" | "Watch" | "High",
      tags: safeTags(row.tagsJson),
      openItems: row.openItems,
      linkedPlan: row.linkedPlan,
    })),
    tasks: taskRows.map((task) => ({ ...task, status: task.status as "open" | "completed" })),
    activities: activityRows.map((activity) => ({ ...activity, type: activity.type as WorkspaceSnapshot["activities"][number]["type"] })),
    opportunities: opportunityRows.map((opportunity) => ({ ...opportunity, stage: opportunity.stage as WorkspaceSnapshot["opportunities"][number]["stage"] })),
    workflowSteps: stepRows.map((step) => ({ ...step, status: step.status as "pending" | "completed" })),
    auditEvents: auditRows,
    plannerScenario,
    updatedAt: new Date().toISOString(),
  };
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function appendAudit(actor: string, eventType: string, entityType: string, entityId: string, payload: unknown) {
  const db = getDb();
  const previous = await db.select({ eventHash: auditEvents.eventHash }).from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(1);
  const previousHash = previous[0]?.eventHash ?? "GENESIS";
  const createdAt = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);
  const eventHash = await digest([previousHash, createdAt, actor, eventType, entityType, entityId, payloadJson].join("|"));
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), eventType, entityType, entityId, actor, payloadJson, previousHash, eventHash, createdAt }).run();
}

async function addActivity(householdId: string, type: string, detail: string, actor: string) {
  const id = crypto.randomUUID();
  const occurredAt = new Date().toISOString();
  await getDb().insert(activities).values({ id, householdId, type, detail, actor, occurredAt }).run();
  return id;
}

async function requireHousehold(householdId: string) {
  const row = await getDb().select({ id: households.id }).from(households).where(eq(households.id, householdId)).limit(1);
  if (!row[0]) throw new Error("Household not found.");
}

export async function createActivity(actor: string, input: { householdId: string; type: string; detail: string }) {
  await ensureWorkspace();
  await requireHousehold(input.householdId);
  const detail = input.detail.trim();
  if (!detail || detail.length > 2000) throw new Error("Enter between 1 and 2,000 characters.");
  if (!(["Note", "Task", "Decision"] as const).includes(input.type as "Note" | "Task" | "Decision")) throw new Error("Unsupported activity type.");

  if (input.type === "Task") {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await getDb().insert(tasks).values({ id, householdId: input.householdId, title: detail, dueDate: "2026-08-12", dueLabel: "Today", owner: initials(actor), category: "Captured", status: "open", requiresApproval: false, createdAt: now, updatedAt: now }).run();
    await appendAudit(actor, "task.created", "task", id, { householdId: input.householdId, title: detail });
  }
  const activityId = await addActivity(input.householdId, input.type, detail, actor);
  await appendAudit(actor, "activity.created", "activity", activityId, { householdId: input.householdId, type: input.type, detail });
}

export async function createTask(actor: string, input: { householdId: string; title: string; category: string; requiresApproval?: boolean }) {
  await ensureWorkspace();
  await requireHousehold(input.householdId);
  const title = input.title.trim();
  if (!title || title.length > 240) throw new Error("Task title must be between 1 and 240 characters.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDb().insert(tasks).values({ id, householdId: input.householdId, title, dueDate: "2026-08-12", dueLabel: "Today", owner: initials(actor), category: input.category.slice(0, 40), status: "open", requiresApproval: Boolean(input.requiresApproval), createdAt: now, updatedAt: now }).run();
  await addActivity(input.householdId, "Task", `Created task: ${title}`, actor);
  await appendAudit(actor, "task.created", "task", id, { householdId: input.householdId, title, category: input.category, requiresApproval: Boolean(input.requiresApproval) });
}

export async function toggleTask(actor: string, id: string) {
  await ensureWorkspace();
  const db = getDb();
  const row = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!row[0]) throw new Error("Task not found.");
  const status = row[0].status === "completed" ? "open" : "completed";
  const now = new Date().toISOString();
  await db.update(tasks).set({ status, dueLabel: status === "completed" ? "Completed" : row[0].dueLabel === "Completed" ? "Today" : row[0].dueLabel, updatedAt: now }).where(eq(tasks.id, id)).run();
  await addActivity(row[0].householdId, "Workflow", `${status === "completed" ? "Completed" : "Reopened"} task: ${row[0].title}`, actor);
  await appendAudit(actor, `task.${status}`, "task", id, { previousStatus: row[0].status, status });
}

export async function updateOpportunity(actor: string, id: string, stage: string) {
  await ensureWorkspace();
  const allowed = ["Evaluation", "Needs analysis", "Review", "Proposal", "Won"];
  if (!allowed.includes(stage)) throw new Error("Unsupported opportunity stage.");
  const db = getDb();
  const row = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  if (!row[0]) throw new Error("Opportunity not found.");
  await db.update(opportunities).set({ stage, updatedAt: new Date().toISOString() }).where(eq(opportunities.id, id)).run();
  await addActivity(row[0].householdId, "Workflow", `Moved ${row[0].name} to ${stage}`, actor);
  await appendAudit(actor, "opportunity.stage_updated", "opportunity", id, { previousStage: row[0].stage, stage });
}

export async function toggleWorkflowStep(actor: string, id: string) {
  await ensureWorkspace();
  const db = getDb();
  const row = await db.select().from(workflowSteps).where(eq(workflowSteps.id, id)).limit(1);
  if (!row[0]) throw new Error("Workflow step not found.");
  const status = row[0].status === "completed" ? "pending" : "completed";
  const now = new Date().toISOString();
  await db.update(workflowSteps).set({ status, completedAt: status === "completed" ? now : null, completedBy: status === "completed" ? actor : null }).where(eq(workflowSteps.id, id)).run();
  await addActivity(row[0].householdId, "Workflow", `${status === "completed" ? "Completed" : "Reopened"} workflow step: ${row[0].title}`, actor);
  await appendAudit(actor, `workflow_step.${status}`, "workflow_step", id, { previousStatus: row[0].status, status, approvalType: row[0].approvalType });
}

export async function savePlannerScenario(actor: string, scenario: unknown) {
  await ensureWorkspace();
  const serialized = JSON.stringify(scenario);
  if (serialized.length > 100_000 || !isPlannerScenario(scenario)) throw new Error("Planner scenario is invalid or too large.");
  const db = getDb();
  const existing = await db.select({ version: plannerScenarios.version }).from(plannerScenarios).where(eq(plannerScenarios.householdId, "household-1")).limit(1);
  const now = new Date().toISOString();
  const version = (existing[0]?.version ?? 0) + 1;
  await db.insert(plannerScenarios).values({ householdId: "household-1", scenarioJson: serialized, updatedBy: actor, updatedAt: now, version }).onConflictDoUpdate({ target: plannerScenarios.householdId, set: { scenarioJson: serialized, updatedBy: actor, updatedAt: now, version } }).run();
  await addActivity("household-1", "Plan", `Saved planning scenario version ${version}.`, actor);
  await appendAudit(actor, "planner.saved", "planner_scenario", "household-1", { version, householdName: (scenario as { householdName: string }).householdName });
}

function initials(actor: string) {
  const local = actor.includes("@") ? actor.split("@")[0] : actor;
  return local.split(/[._\-\s]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AS";
}

function isPlannerScenario(value: unknown): value is { householdName: string; accounts: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const scenario = value as Record<string, unknown>;
  return typeof scenario.householdName === "string" && scenario.householdName.trim().length <= 120 && Array.isArray(scenario.accounts) && scenario.accounts.length <= 50;
}
