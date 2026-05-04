import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type BlackboardConfig, type ExecutionMetrics } from "./types.js";

/**
 * Blackboard provides file-based persistence for task results, plans,
 * and execution metrics. It also supports remote metrics output via
 * webhook or OpenTelemetry.
 */
export class Blackboard {
  private readonly basePath: string;
  private readonly metricsOutput: BlackboardConfig["metricsOutput"];
  private readonly metricsWebhook: string | undefined;
  private readonly metricsOtelEndpoint: string | undefined;
  private disabled: boolean;

  /**
   * Create a new Blackboard instance.
   * @param config - Blackboard configuration including base path and metrics settings.
   */
  constructor(config: BlackboardConfig) {
    this.basePath = config.basePath;
    this.metricsOutput = config.metricsOutput ?? "blackboard";
    this.metricsWebhook = config.metricsWebhook;
    this.metricsOtelEndpoint = config.metricsOtelEndpoint;
    this.disabled = false;
  }

  /**
   * Write a task result to workspace/results/{taskId}.md.
   * Creates directories recursively. Logs errors but does not throw.
   * @param taskId - Unique task identifier.
   * @param content - Markdown content to persist.
   */
  async writeResult(taskId: string, content: string): Promise<void> {
    if (this.disabled) {
      this.log("warn", `Blackboard disabled, skipping writeResult for ${taskId}`);
      return;
    }
    const filePath = join(this.basePath, "results", `${taskId}.md`);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log("error", `Failed to write result for ${taskId}: ${message}`);
    }
  }

  /**
   * Read a task result from workspace/results/{taskId}.md.
   * Returns an empty string if the file does not exist.
   * @param taskId - Unique task identifier.
   * @returns The file contents or empty string.
   */
  async readResult(taskId: string): Promise<string> {
    const filePath = join(this.basePath, "results", `${taskId}.md`);
    try {
      return await readFile(filePath, "utf-8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return "";
      }
      const message = err instanceof Error ? err.message : String(err);
      this.log("error", `Failed to read result for ${taskId}: ${message}`);
      return "";
    }
  }

  /**
   * Write a plan to workspace/plans/{planId}.md.
   * Creates directories recursively. Logs errors but does not throw.
   * @param planId - Unique plan identifier.
   * @param content - Markdown content to persist.
   */
  async writePlan(planId: string, content: string): Promise<void> {
    if (this.disabled) {
      this.log("warn", `Blackboard disabled, skipping writePlan for ${planId}`);
      return;
    }
    const filePath = join(this.basePath, "plans", `${planId}.md`);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log("error", `Failed to write plan for ${planId}: ${message}`);
    }
  }

  /**
   * Write execution metrics to a local JSON file and optionally forward
   * to a webhook or OpenTelemetry endpoint.
   * @param runId - Unique run identifier.
   * @param metrics - Execution metrics to persist.
   */
  async writeMetrics(runId: string, metrics: ExecutionMetrics): Promise<void> {
    const filePath = join(this.basePath, "metrics", `${runId}.json`);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(metrics, null, 2), "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log("error", `Failed to write local metrics for ${runId}: ${message}`);
    }

    if (this.metricsOutput === "webhook" && this.metricsWebhook !== undefined && this.metricsWebhook.length > 0) {
      try {
        const response = await fetch(this.metricsWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metrics),
        });
        if (!response.ok) {
          this.log("error", `Webhook returned ${response.status} for ${runId}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log("error", `Failed to POST metrics webhook for ${runId}: ${message}`);
      }
    }

    if (this.metricsOutput === "otel" && this.metricsOtelEndpoint !== undefined && this.metricsOtelEndpoint.length > 0) {
      try {
        const otlpPayload = this.buildOtlpPayload(metrics);
        const response = await fetch(this.metricsOtelEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(otlpPayload),
        });
        if (!response.ok) {
          this.log("error", `OTel endpoint returned ${response.status} for ${runId}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log("error", `Failed to POST metrics OTel for ${runId}: ${message}`);
      }
    }
  }

  /**
   * Read all task results and format them as a single Markdown document.
   * Missing results are silently omitted.
   * @param taskIds - List of task identifiers to aggregate.
   * @returns Markdown string with each result under a heading.
   */
  async aggregateResults(taskIds: string[]): Promise<string> {
    const parts: string[] = [];
    for (const taskId of taskIds) {
      const content = await this.readResult(taskId);
      if (content.length > 0) {
        parts.push(`## Task ${taskId}\n${content}\n\n`);
      }
    }
    return parts.join("");
  }

  /**
   * Perform cleanup based on the given reason.
   * - reset: clear results but keep plans
   * - delete: remove the entire workspace directory
   * - disable: stop accepting new writes
   * - restart: preserve all data (no-op)
   * @param reason - Cleanup strategy to apply.
   */
  async cleanup(reason: "reset" | "delete" | "disable" | "restart"): Promise<void> {
    switch (reason) {
      case "reset": {
        const resultsPath = join(this.basePath, "results");
        try {
          await rm(resultsPath, { recursive: true, force: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.log("error", `Failed to reset results: ${message}`);
        }
        break;
      }
      case "delete": {
        try {
          await rm(this.basePath, { recursive: true, force: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.log("error", `Failed to delete workspace: ${message}`);
        }
        break;
      }
      case "disable": {
        this.disabled = true;
        break;
      }
      case "restart": {
        // no-op: preserve all data
        break;
      }
    }
  }

  /**
   * Check whether the blackboard is currently disabled.
   * @returns true if writes are being ignored.
   */
  isDisabled(): boolean {
    return this.disabled;
  }

  /**
   * Build an OTLP JSON payload for the given metrics.
   * @param metrics - Execution metrics.
   * @returns OTLP-compatible JSON object.
   */
  private buildOtlpPayload(metrics: ExecutionMetrics): unknown {
    return {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "korchestrator" } },
            ],
          },
          scopeMetrics: [
            {
              scope: { name: "korchestrator.metrics" },
              metrics: [
                {
                  name: "execution.duration",
                  unit: "ms",
                  description: "Execution duration in milliseconds",
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: metrics.durationMs,
                        timeUnixNano: `${metrics.timestamp}000000`,
                        attributes: [
                          { key: "run.id", value: { stringValue: metrics.runId } },
                          { key: "success", value: { boolValue: metrics.success } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  /**
   * Internal logging helper.
   * @param level - Log level.
   * @param message - Message to log.
   */
  private log(level: "info" | "error" | "warn", message: string): void {
    console[level](`[Blackboard] ${message}`);
  }
}
