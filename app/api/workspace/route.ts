import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { createActivity, createTask, readWorkspace, savePlannerScenario, toggleTask, toggleWorkflowStep, updateOpportunity } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";

function cleanString(value: unknown, field: string, max = 2000) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new Error(`${field} is invalid.`);
  return cleaned;
}

async function actor() {
  return (await getChatGPTUser())?.email ?? "preview-user";
}

export async function GET() {
  try {
    return NextResponse.json(await readWorkspace(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("workspace.read_failed", error);
    return NextResponse.json({ error: "The workspace could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "JSON request required." }, { status: 415 });
    }
    const body = await request.json() as Record<string, unknown>;
    const user = await actor();
    const action = cleanString(body.action, "Action", 60);

    if (action === "create_activity") {
      await createActivity(user, { householdId: cleanString(body.householdId, "Household", 80), type: cleanString(body.type, "Type", 20), detail: cleanString(body.detail, "Detail") });
    } else if (action === "create_task") {
      await createTask(user, { householdId: cleanString(body.householdId, "Household", 80), title: cleanString(body.title, "Title", 240), category: cleanString(body.category, "Category", 40), requiresApproval: body.requiresApproval === true });
    } else if (action === "toggle_task") {
      await toggleTask(user, cleanString(body.id, "Task", 80));
    } else if (action === "update_opportunity") {
      await updateOpportunity(user, cleanString(body.id, "Opportunity", 80), cleanString(body.stage, "Stage", 40));
    } else if (action === "toggle_workflow_step") {
      await toggleWorkflowStep(user, cleanString(body.id, "Workflow step", 80));
    } else if (action === "save_planner") {
      await savePlannerScenario(user, body.scenario);
    } else {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    return NextResponse.json(await readWorkspace(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("workspace.action_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed." }, { status: 400 });
  }
}
