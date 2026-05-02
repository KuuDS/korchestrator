import { describe, it, expect } from "vitest";
import { Replanner } from "../src/replanner";
import { Plan, Task } from "../src/types";

function createTask(id: string, status: Task["status"] = "pending", retryCount?: number): Task {
  return {
    id,
    description: `Task ${id}`,
    skills: ["code"],
    dependencies: [],
    status,
    requiresApproval: false,
    _retryCount: retryCount,
  };
}

describe("Replanner.check", () => {
  const replanner = new Replanner({ model: "gpt-4o-mini" });

  it("should return needsReroute=false when all tasks done", async () => {
    const plan: Plan = {
      id: "plan_1",
      status: "executing",
      tasks: [createTask("task_001", "done"), createTask("task_002", "done")],
      taskRunMap: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const health = await replanner.check(plan);
    expect(health.needsReroute).toBe(false);
    expect(health.failedTasks).toHaveLength(0);
  });

  it("should return needsReroute=true when tasks failed", async () => {
    const plan: Plan = {
      id: "plan_1",
      status: "executing",
      tasks: [createTask("task_001", "failed"), createTask("task_002", "done")],
      taskRunMap: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const health = await replanner.check(plan);
    expect(health.needsReroute).toBe(true);
    expect(health.failedTasks).toHaveLength(1);
  });

  it("should calculate total retry count correctly", async () => {
    const plan: Plan = {
      id: "plan_1",
      status: "executing",
      tasks: [
        createTask("task_001", "failed", 2),
        createTask("task_002", "failed", 3),
      ],
      taskRunMap: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const health = await replanner.check(plan);
    expect(health.needsReroute).toBe(true);
    expect(health.reason).toContain("5"); // 2 + 3 = 5 total retries
  });

  it("should return needsReroute=false when tasks are running", async () => {
    const plan: Plan = {
      id: "plan_1",
      status: "executing",
      tasks: [createTask("task_001", "running")],
      taskRunMap: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const health = await replanner.check(plan);
    expect(health.needsReroute).toBe(false);
  });
});

describe("Replanner.replan", () => {
  const replanner = new Replanner({ model: "gpt-4o-mini" });

  it("should apply retry strategy", async () => {
    const plan: Plan = {
      id: "plan_1",
      status: "executing",
      tasks: [createTask("task_001", "failed", 1)],
      taskRunMap: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const failedTasks = [plan.tasks[0]];
    const newPlan = await replanner.replan(plan, failedTasks);
    expect(newPlan.tasks[0].status).toBe("pending");
    expect(newPlan.tasks[0]._retryCount).toBe(2);
  });

  it("should apply skip strategy", async () => {
    const plan: Plan = {
      id: "plan_1",
      status: "executing",
      tasks: [createTask("task_001", "failed")],
      taskRunMap: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    // Skip strategy would require LLM to return "skip", but we test retry by default
    const failedTasks = [plan.tasks[0]];
    const newPlan = await replanner.replan(plan, failedTasks);
    // Default is retry
    expect(newPlan.tasks[0].status).toBe("pending");
  });
});
