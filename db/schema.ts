import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  primaryName: text("primary_name").notNull(),
  partnerName: text("partner_name"),
  serviceTier: text("service_tier").notNull(),
  assets: integer("assets").notNull(),
  cashBalance: integer("cash_balance").notNull(),
  nextReview: text("next_review").notNull(),
  lastContact: text("last_contact").notNull(),
  planStatus: text("plan_status").notNull(),
  riskLevel: text("risk_level").notNull(),
  tagsJson: text("tags_json").notNull(),
  openItems: integer("open_items").notNull(),
  linkedPlan: integer("linked_plan", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("households_next_review_idx").on(table.nextReview),
  index("households_risk_level_idx").on(table.riskLevel),
]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  dueLabel: text("due_label").notNull(),
  owner: text("owner").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull(),
  requiresApproval: integer("requires_approval", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("tasks_household_idx").on(table.householdId),
  index("tasks_status_due_idx").on(table.status, table.dueDate),
]);

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  type: text("type").notNull(),
  detail: text("detail").notNull(),
  actor: text("actor").notNull(),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [index("activities_household_time_idx").on(table.householdId, table.occurredAt)]);

export const opportunities = sqliteTable("opportunities", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  name: text("name").notNull(),
  value: integer("value").notNull(),
  stage: text("stage").notNull(),
  owner: text("owner").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("opportunities_stage_idx").on(table.stage)]);

export const workflowSteps = sqliteTable("workflow_steps", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  workflowName: text("workflow_name").notNull(),
  sequence: integer("sequence").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  approvalType: text("approval_type"),
  completedBy: text("completed_by"),
  completedAt: text("completed_at"),
}, (table) => [index("workflow_household_sequence_idx").on(table.householdId, table.sequence)]);

export const plannerScenarios = sqliteTable("planner_scenarios", {
  householdId: text("household_id").primaryKey(),
  scenarioJson: text("scenario_json").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  actor: text("actor").notNull(),
  payloadJson: text("payload_json").notNull(),
  previousHash: text("previous_hash").notNull(),
  eventHash: text("event_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("audit_created_idx").on(table.createdAt)]);
