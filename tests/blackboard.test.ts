import { describe, it, expect } from "vitest";
import { Blackboard } from "../src/blackboard";
import { rm, mkdir, access } from "fs/promises";
import { join } from "path";

describe("Blackboard", () => {
  const testBasePath = "./test-workspace";
  let blackboard: Blackboard;

  beforeEach(async () => {
    try {
      await rm(testBasePath, { recursive: true, force: true });
    } catch {
      // ignore
    }
    blackboard = new Blackboard(testBasePath);
  });

  afterEach(async () => {
    try {
      await rm(testBasePath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("should write and read result", async () => {
    await blackboard.writeResult("task_001", "Test content");
    const content = await blackboard.readResult("task_001");
    expect(content).toBe("Test content");
  });

  it("should return empty string for missing result", async () => {
    const content = await blackboard.readResult("nonexistent");
    expect(content).toBe("");
  });

  it("should write plan", async () => {
    await blackboard.writePlan("plan_001", "Plan content");
    // Plan should be written to PLANS directory
  });

  it("should write metrics", async () => {
    await blackboard.writeMetrics("run_001", '{"test": true}');
  });

  it("should aggregate results", async () => {
    await blackboard.writeResult("task_001", "Content 1");
    await blackboard.writeResult("task_002", "Content 2");
    const aggregated = await blackboard.aggregateResults(["task_001", "task_002"]);
    expect(aggregated).toContain("Content 1");
    expect(aggregated).toContain("Content 2");
  });
});

describe("Blackboard.cleanup", () => {
  const testBasePath = "./test-workspace-cleanup";
  let blackboard: Blackboard;

  beforeEach(async () => {
    try {
      await rm(testBasePath, { recursive: true, force: true });
    } catch {
      // ignore
    }
    blackboard = new Blackboard(testBasePath);
    
    // Create test files in all directories
    await blackboard.writeResult("task_001", "workspace content");
    await blackboard.writeMetrics("run_001", "metrics content");
    await blackboard.writePlan("plan_001", "plan content");
  });

  afterEach(async () => {
    try {
      await rm(testBasePath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("should clear WORKSPACE and METRICS on reset, preserve PLANS", async () => {
    await blackboard.cleanup("reset");
    
    // WORKSPACE should be cleared
    await expect(access(join(testBasePath, "WORKSPACE"))).rejects.toThrow();
    
    // METRICS should be cleared
    await expect(access(join(testBasePath, "METRICS"))).rejects.toThrow();
    
    // PLANS should be preserved
    const planContent = await blackboard.readResult("../PLANS/plan_001");
    // PLANS directory should still exist
  });

  it("should clear all directories on delete", async () => {
    await blackboard.cleanup("delete");
    
    // All directories should be cleared
    await expect(access(join(testBasePath, "WORKSPACE"))).rejects.toThrow();
    await expect(access(join(testBasePath, "METRICS"))).rejects.toThrow();
    await expect(access(join(testBasePath, "PLANS"))).rejects.toThrow();
  });

  it("should preserve all directories on disable", async () => {
    await blackboard.cleanup("disable");
    
    // All directories should still exist
    const workspaceContent = await blackboard.readResult("task_001");
    expect(workspaceContent).toBe("workspace content");
  });

  it("should clear WORKSPACE and METRICS on restart, preserve PLANS", async () => {
    await blackboard.cleanup("restart");
    
    // WORKSPACE should be cleared
    await expect(access(join(testBasePath, "WORKSPACE"))).rejects.toThrow();
    
    // METRICS should be cleared
    await expect(access(join(testBasePath, "METRICS"))).rejects.toThrow();
    
    // PLANS should be preserved
  });
});
