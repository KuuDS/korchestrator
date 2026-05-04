import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Blackboard } from "../src/blackboard.js";
import type { ExecutionMetrics } from "../src/types.js";

let testCounter = 0;

function getTestBase(): string {
  return `./workspace-test-blackboard-${testCounter}`;
}

async function resetTestDir(basePath: string): Promise<void> {
  try {
    await rm(basePath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("Blackboard", () => {
  beforeEach(async () => {
    testCounter += 1;
    await resetTestDir(getTestBase());
  });

  afterEach(async () => {
    await resetTestDir(getTestBase());
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // writeResult / readResult
  // ─────────────────────────────────────────────────────────────────────────────

  describe("writeResult", () => {
    it("writes content to workspace/results/{taskId}.md", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_001", "Hello result");
      const content = await readFile(join(getTestBase(), "results", "task_001.md"), "utf-8");
      expect(content).toBe("Hello result");
    });

    it("creates nested directories recursively", async () => {
      const bb = new Blackboard({ basePath: join(getTestBase(), "nested", "deep") });
      await bb.writeResult("task_002", "Deep result");
      const content = await readFile(
        join(getTestBase(), "nested", "deep", "results", "task_002.md"),
        "utf-8"
      );
      expect(content).toBe("Deep result");
    });

    it("does not throw on write error", async () => {
      const bb = new Blackboard({ basePath: "/dev/null/invalid" });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(bb.writeResult("task_003", "content")).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("readResult", () => {
    it("returns file contents when file exists", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_004", "Result content");
      const content = await bb.readResult("task_004");
      expect(content).toBe("Result content");
    });

    it("returns empty string when file does not exist", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      const content = await bb.readResult("task_missing");
      expect(content).toBe("");
    });

    it("logs error for non-ENOENT read failures", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // Create a directory where a file is expected; reading it as a file triggers EISDIR
      // Note: readResult appends .md, so we create a directory with .md suffix
      await mkdir(join(getTestBase(), "results", "task_bad.md"), { recursive: true });
      const content = await bb.readResult("task_bad");
      expect(content).toBe("");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // writePlan
  // ─────────────────────────────────────────────────────────────────────────────

  describe("writePlan", () => {
    it("writes plan to workspace/plans/{planId}.md", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writePlan("plan_001", "Plan content");
      const content = await readFile(join(getTestBase(), "plans", "plan_001.md"), "utf-8");
      expect(content).toBe("Plan content");
    });

    it("does not throw on write error", async () => {
      const bb = new Blackboard({ basePath: "/dev/null/invalid" });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(bb.writePlan("plan_002", "content")).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // writeMetrics
  // ─────────────────────────────────────────────────────────────────────────────

  describe("writeMetrics", () => {
    function makeMetrics(runId: string): ExecutionMetrics {
      return {
        runId,
        durationMs: 1234,
        success: true,
        timestamp: 1700000000,
      };
    }

    it("always writes local JSON file for blackboard mode", async () => {
      const bb = new Blackboard({ basePath: getTestBase(), metricsOutput: "blackboard" });
      await bb.writeMetrics("run_001", makeMetrics("run_001"));
      const content = await readFile(join(getTestBase(), "metrics", "run_001.json"), "utf-8");
      const parsed = JSON.parse(content) as ExecutionMetrics;
      expect(parsed.runId).toBe("run_001");
      expect(parsed.durationMs).toBe(1234);
    });

    it("writes local file and POSTs to webhook when metricsOutput is webhook", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const bb = new Blackboard({
        basePath: getTestBase(),
        metricsOutput: "webhook",
        metricsWebhook: "https://example.com/webhook",
      });
      await bb.writeMetrics("run_002", makeMetrics("run_002"));

      const localContent = await readFile(join(getTestBase(), "metrics", "run_002.json"), "utf-8");
      expect(JSON.parse(localContent).runId).toBe("run_002");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      fetchSpy.mockRestore();
    });

    it("logs webhook error on non-ok response", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const bb = new Blackboard({
        basePath: getTestBase(),
        metricsOutput: "webhook",
        metricsWebhook: "https://example.com/webhook",
      });
      await bb.writeMetrics("run_003", makeMetrics("run_003"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Webhook returned 500"));

      fetchSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it("logs webhook error on fetch failure", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const bb = new Blackboard({
        basePath: getTestBase(),
        metricsOutput: "webhook",
        metricsWebhook: "https://example.com/webhook",
      });
      await bb.writeMetrics("run_004", makeMetrics("run_004"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Network error"));

      fetchSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it("writes local file and POSTs OTLP payload when metricsOutput is otel", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const bb = new Blackboard({
        basePath: getTestBase(),
        metricsOutput: "otel",
        metricsOtelEndpoint: "https://otel.example.com/v1/metrics",
      });
      await bb.writeMetrics("run_005", makeMetrics("run_005"));

      const localContent = await readFile(join(getTestBase(), "metrics", "run_005.json"), "utf-8");
      expect(JSON.parse(localContent).runId).toBe("run_005");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://otel.example.com/v1/metrics",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(callBody).toHaveProperty("resourceMetrics");

      fetchSpy.mockRestore();
    });

    it("logs otel error on non-ok response", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 503,
      } as Response);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const bb = new Blackboard({
        basePath: getTestBase(),
        metricsOutput: "otel",
        metricsOtelEndpoint: "https://otel.example.com/v1/metrics",
      });
      await bb.writeMetrics("run_006", makeMetrics("run_006"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("OTel endpoint returned 503"));

      fetchSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it("logs otel error on fetch failure", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("OTel down"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const bb = new Blackboard({
        basePath: getTestBase(),
        metricsOutput: "otel",
        metricsOtelEndpoint: "https://otel.example.com/v1/metrics",
      });
      await bb.writeMetrics("run_007", makeMetrics("run_007"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("OTel down"));

      fetchSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it("only writes local file for none mode", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const bb = new Blackboard({
        basePath: getTestBase(),
        metricsOutput: "none",
      });
      await bb.writeMetrics("run_008", makeMetrics("run_008"));

      const localContent = await readFile(join(getTestBase(), "metrics", "run_008.json"), "utf-8");
      expect(JSON.parse(localContent).runId).toBe("run_008");
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it("does not throw when local metrics write fails", async () => {
      const bb = new Blackboard({ basePath: "/dev/null/invalid" });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(bb.writeMetrics("run_009", makeMetrics("run_009"))).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // aggregateResults
  // ─────────────────────────────────────────────────────────────────────────────

  describe("aggregateResults", () => {
    it("aggregates multiple task results into markdown", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_a", "Result A");
      await bb.writeResult("task_b", "Result B");
      const aggregated = await bb.aggregateResults(["task_a", "task_b"]);
      expect(aggregated).toContain("## Task task_a");
      expect(aggregated).toContain("Result A");
      expect(aggregated).toContain("## Task task_b");
      expect(aggregated).toContain("Result B");
    });

    it("omits missing results", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_c", "Result C");
      const aggregated = await bb.aggregateResults(["task_c", "task_missing"]);
      expect(aggregated).toContain("## Task task_c");
      expect(aggregated).not.toContain("task_missing");
    });

    it("returns empty string when no results exist", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      const aggregated = await bb.aggregateResults(["task_x", "task_y"]);
      expect(aggregated).toBe("");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // cleanup
  // ─────────────────────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("reset removes results but keeps plans", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_r", "Result");
      await bb.writePlan("plan_r", "Plan");
      await bb.cleanup("reset");
      expect(await bb.readResult("task_r")).toBe("");
      const planContent = await readFile(join(getTestBase(), "plans", "plan_r.md"), "utf-8");
      expect(planContent).toBe("Plan");
    });

    it("delete removes the entire workspace directory", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_d", "Result");
      await bb.writePlan("plan_d", "Plan");
      await bb.cleanup("delete");
      await expect(readdir(getTestBase())).rejects.toThrow();
    });

    it("disable stops accepting new writes", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_pre", "Pre");
      await bb.cleanup("disable");
      expect(bb.isDisabled()).toBe(true);
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await bb.writeResult("task_post", "Post");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("disabled"));
      consoleSpy.mockRestore();
      const content = await bb.readResult("task_pre");
      expect(content).toBe("Pre");
    });

    it("restart is a no-op and preserves data", async () => {
      const bb = new Blackboard({ basePath: getTestBase() });
      await bb.writeResult("task_n", "Result");
      await bb.writePlan("plan_n", "Plan");
      await bb.cleanup("restart");
      expect(await bb.readResult("task_n")).toBe("Result");
      const planContent = await readFile(join(getTestBase(), "plans", "plan_n.md"), "utf-8");
      expect(planContent).toBe("Plan");
    });

    it("does not throw on cleanup errors", async () => {
      const bb = new Blackboard({ basePath: "/dev/null/invalid" });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(bb.cleanup("delete")).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
