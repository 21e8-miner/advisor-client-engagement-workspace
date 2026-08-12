export type Household = {
  id: string;
  name: string;
  primaryName: string;
  partnerName: string | null;
  serviceTier: string;
  assets: number;
  cashBalance: number;
  nextReview: string;
  lastContact: string;
  planStatus: string;
  riskLevel: "Low" | "Watch" | "High";
  tags: string[];
  openItems: number;
  linkedPlan: boolean;
};

export type WorkspaceTask = {
  id: string;
  householdId: string;
  title: string;
  dueDate: string;
  dueLabel: string;
  owner: string;
  category: string;
  status: "open" | "completed";
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceActivity = {
  id: string;
  householdId: string;
  type: "Note" | "Task" | "Decision" | "Plan" | "Workflow" | "Service";
  detail: string;
  actor: string;
  occurredAt: string;
};

export type WorkspaceOpportunity = {
  id: string;
  householdId: string;
  name: string;
  value: number;
  stage: "Evaluation" | "Needs analysis" | "Review" | "Proposal" | "Won";
  owner: string;
  updatedAt: string;
};

export type WorkspaceStep = {
  id: string;
  householdId: string;
  workflowName: string;
  sequence: number;
  title: string;
  status: "pending" | "completed";
  approvalType: string | null;
  completedBy: string | null;
  completedAt: string | null;
};

export type AuditEvent = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actor: string;
  eventHash: string;
  createdAt: string;
};

export type WorkspaceSnapshot = {
  households: Household[];
  tasks: WorkspaceTask[];
  activities: WorkspaceActivity[];
  opportunities: WorkspaceOpportunity[];
  workflowSteps: WorkspaceStep[];
  auditEvents: AuditEvent[];
  plannerScenario: unknown | null;
  updatedAt: string;
};
