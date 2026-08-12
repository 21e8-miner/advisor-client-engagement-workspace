import type { Household, WorkspaceActivity, WorkspaceOpportunity, WorkspaceStep, WorkspaceTask } from "./workspace-types";

const seededAt = "2026-08-12T13:00:00.000Z";

export const seedHouseholds: Household[] = [
  { id: "household-1", name: "Sample household", primaryName: "Primary client", partnerName: "Partner", serviceTier: "Private client", assets: 2600000, cashBalance: 182000, nextReview: "2026-08-27", lastContact: "2026-08-11", planStatus: "In progress", riskLevel: "Watch", tags: ["Retirement", "Tax-sensitive"], openItems: 3, linkedPlan: true },
  { id: "household-2", name: "Illustrative household 02", primaryName: "Client A", partnerName: "Client B", serviceTier: "Core wealth", assets: 4180000, cashBalance: 126000, nextReview: "2026-08-14", lastContact: "2026-07-28", planStatus: "Review due", riskLevel: "Watch", tags: ["Executive", "Concentrated stock"], openItems: 2, linkedPlan: false },
  { id: "household-3", name: "Illustrative household 03", primaryName: "Client C", partnerName: null, serviceTier: "Private client", assets: 8350000, cashBalance: 940000, nextReview: "2026-09-09", lastContact: "2026-08-04", planStatus: "Current", riskLevel: "High", tags: ["Liquidity", "Estate"], openItems: 4, linkedPlan: false },
  { id: "household-4", name: "Illustrative household 04", primaryName: "Client D", partnerName: "Client E", serviceTier: "Core wealth", assets: 1920000, cashBalance: 87000, nextReview: "2026-10-02", lastContact: "2026-05-01", planStatus: "Current", riskLevel: "Watch", tags: ["Business owner"], openItems: 1, linkedPlan: false },
  { id: "household-5", name: "Illustrative household 05", primaryName: "Client F", partnerName: null, serviceTier: "Emerging wealth", assets: 980000, cashBalance: 54000, nextReview: "2026-11-18", lastContact: "2026-08-08", planStatus: "Discovery", riskLevel: "Low", tags: ["Next generation"], openItems: 2, linkedPlan: false },
];

export const seedTasks: WorkspaceTask[] = [
  { id: "task-1", householdId: "household-1", title: "Verify prior 12/31 IRA balance", dueDate: "2026-08-12", dueLabel: "Today", owner: "AS", category: "Data", status: "open", requiresApproval: false, createdAt: seededAt, updatedAt: seededAt },
  { id: "task-2", householdId: "household-1", title: "Request current Social Security statements", dueDate: "2026-08-13", dueLabel: "Tomorrow", owner: "AS", category: "Client", status: "open", requiresApproval: false, createdAt: seededAt, updatedAt: seededAt },
  { id: "task-3", householdId: "household-1", title: "Review conversion range with tax professional", dueDate: "2026-08-19", dueLabel: "Aug 19", owner: "JL", category: "Tax", status: "open", requiresApproval: true, createdAt: seededAt, updatedAt: seededAt },
  { id: "task-4", householdId: "household-1", title: "Document taxable-lot assumptions", dueDate: "2026-08-10", dueLabel: "Completed", owner: "AS", category: "Planning", status: "completed", requiresApproval: false, createdAt: seededAt, updatedAt: seededAt },
];

export const seedActivities: WorkspaceActivity[] = [
  { id: "activity-1", householdId: "household-1", type: "Plan", detail: "2026 income plan recalculated using current household assumptions.", actor: "Planning engine", occurredAt: "2026-08-12T13:18:00.000Z" },
  { id: "activity-2", householdId: "household-1", type: "Note", detail: "Retirement target remains January 2027. Preserve one year of spending outside retirement accounts.", actor: "AS", occurredAt: "2026-08-11T20:42:00.000Z" },
  { id: "activity-3", householdId: "household-1", type: "Decision", detail: "Conversion is a planning candidate only; advisor and tax professional review required before execution.", actor: "AS", occurredAt: "2026-08-10T18:05:00.000Z" },
];

export const seedOpportunities: WorkspaceOpportunity[] = [
  { id: "opportunity-1", householdId: "household-1", name: "Held-away IRA consolidation", value: 1450000, stage: "Needs analysis", owner: "AS", updatedAt: seededAt },
  { id: "opportunity-2", householdId: "household-1", name: "Tax-managed account transition", value: 850000, stage: "Review", owner: "JL", updatedAt: seededAt },
];

export const seedWorkflowSteps: WorkspaceStep[] = [
  "Confirm household and contact details",
  "Verify income and account values",
  "Run tax-smart income plan",
  "Complete advisor review",
  "Coordinate with tax professional",
  "Send approved client recap",
].map((title, index) => ({
  id: `workflow-1-${index + 1}`,
  householdId: "household-1",
  workflowName: "2026 income plan",
  sequence: index + 1,
  title,
  status: index === 0 ? "completed" : "pending",
  approvalType: index === 3 ? "Advisor approval" : index === 4 ? "Tax professional coordination" : null,
  completedBy: index === 0 ? "AS" : null,
  completedAt: index === 0 ? seededAt : null,
}));
