import { describe, it, expect } from "vitest";
import { TaskRouter, defaultRoles } from "../src/router";
import { Plan, Task } from "../src/types";

function createTask(id: string, status: Task["status"] = "pending", deps: string[] = [], skills: string[] = ["code"]): Task {
  return {
    id,
    description: `Task ${id}`,
    skills,
    dependencies: deps,
    status,
    requiresApproval: false,
  };
}

describe("TaskRouter", () => {
  const router = new TaskRouter({ maxConcurrency: 3, agentPool: defaultRoles });

  describe("getReadyTasks", () => {
    it("should return tasks with no dependencies", () => {
      const plan: Plan = {
        id: "plan_1",
        status: "executing",
        tasks: [createTask("task_001"), createTask("task_002")],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ready = router.getReadyTasks(plan);
      expect(ready).toHaveLength(2);
    });

    it("should not return tasks with unmet dependencies", () => {
      const plan: Plan = {
        id: "plan_1",
        status: "executing",
        tasks: [
          createTask("task_001"),
          createTask("task_002", "pending", ["task_001"]),
        ],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ready = router.getReadyTasks(plan);
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("task_001");
    });

    it("should return tasks with completed dependencies", () => {
      const plan: Plan = {
        id: "plan_1",
        status: "executing",
        tasks: [
          createTask("task_001", "done"),
          createTask("task_002", "pending", ["task_001"]),
        ],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ready = router.getReadyTasks(plan);
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("task_002");
    });
  });

  describe("routeBySkill", () => {
    it("should route search task to researcher", () => {
      const task = createTask("task_001", "pending", [], ["search"]);
      const agent = router.routeBySkill(task);
      expect(agent.agentId).toBe("researcher");
    });

    it("should route code+shell task to coder", () => {
      const task = createTask("task_001", "pending", [], ["code", "shell"]);
      const agent = router.routeBySkill(task);
      expect(agent.agentId).toBe("coder");
    });

    it("should route browser task to browser operator", () => {
      const task = createTask("task_001", "pending", [], ["browser"]);
      const agent = router.routeBySkill(task);
      expect(agent.agentId).toBe("browser");
    });

    it("should fallback to coder for unknown skills", () => {
      const task = createTask("task_001", "pending", [], ["unknown"]);
      const agent = router.routeBySkill(task);
      expect(agent.agentId).toBe("coder");
    });
  });

  describe("hasMoreWork", () => {
    it("should return true when tasks are pending", () => {
      const plan: Plan = {
        id: "plan_1",
        status: "executing",
        tasks: [createTask("task_001")],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(router.hasMoreWork(plan)).toBe(true);
    });

    it("should return false when all tasks are done", () => {
      const plan: Plan = {
        id: "plan_1",
        status: "executing",
        tasks: [createTask("task_001", "done")],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(router.hasMoreWork(plan)).toBe(false);
    });
  });

  describe("getProgress", () => {
    it("should return correct progress counts", () => {
      const plan: Plan = {
        id: "plan_1",
        status: "executing",
        tasks: [
          createTask("task_001", "done"),
          createTask("task_002", "failed"),
          createTask("task_003", "running"),
          createTask("task_004"),
        ],
        taskRunMap: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const progress = router.getProgress(plan);
      expect(progress).toEqual({
        total: 4,
        done: 1,
        failed: 1,
        running: 1,
        pending: 1,
      });
    });
  });
});
