/**
 * Validation Rules Framework - Persistence Layer
 *
 * Handles recording, querying, and cleanup of validation history.
 */

import type {
  ValidationHistoryRecord,
  ValidationReport,
  RetentionConfig,
} from "./types.js";
import { ValidationHistoryRecordSchema } from "./types.js";

// ───────────────────────────────────────────────────────────────────────────────
// ValidationHistoryRecorder
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Records validation results to a session store.
 */
export class ValidationHistoryRecorder {
  private readonly sessionStore: Map<string, ValidationHistoryRecord[]>;

  constructor(sessionStore?: Map<string, ValidationHistoryRecord[]>) {
    this.sessionStore = sessionStore ?? new Map();
  }

  /**
   * Record a plan validation result.
   */
  recordPlanValidation(
    sessionId: string,
    planId: string,
    report: ValidationReport
  ): ValidationHistoryRecord {
    const record: ValidationHistoryRecord = {
      id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: report.timestamp,
      type: "plan",
      planId,
      results: report.results,
    };

    const records = this.sessionStore.get(sessionId) ?? [];
    records.push(record);
    this.sessionStore.set(sessionId, records);

    return record;
  }

  /**
   * Record a task validation result.
   */
  recordTaskValidation(
    sessionId: string,
    taskId: string,
    agentId: string,
    report: ValidationReport
  ): ValidationHistoryRecord {
    const record: ValidationHistoryRecord = {
      id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: report.timestamp,
      type: "task",
      taskId,
      agentId,
      results: report.results,
    };

    const records = this.sessionStore.get(sessionId) ?? [];
    records.push(record);
    this.sessionStore.set(sessionId, records);

    return record;
  }

  /**
   * Get all validation records for a session.
   */
  getHistory(sessionId: string): ValidationHistoryRecord[] {
    return [...(this.sessionStore.get(sessionId) ?? [])];
  }

  /**
   * Get validation records for a specific plan.
   */
  getPlanHistory(sessionId: string, planId: string): ValidationHistoryRecord[] {
    return this.getHistory(sessionId).filter(
      (r) => r.type === "plan" && r.planId === planId
    );
  }

  /**
   * Get validation records for a specific task.
   */
  getTaskHistory(sessionId: string, taskId: string): ValidationHistoryRecord[] {
    return this.getHistory(sessionId).filter(
      (r) => r.type === "task" && r.taskId === taskId
    );
  }

  /**
   * Clean up old validation records based on retention config.
   *
   * @param sessionId - Session identifier
   * @param config - Retention configuration
   * @returns Number of records removed
   */
  cleanup(sessionId: string, config: RetentionConfig): number {
    const records = this.sessionStore.get(sessionId) ?? [];
    const originalCount = records.length;

    let filtered = records;

    // Filter by maxAge
    if (config.maxAge !== undefined) {
      const match = config.maxAge.match(/^(\d+)([dhms])$/);
      if (match !== null) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        let maxAgeMs: number;
        switch (unit) {
          case "d":
            maxAgeMs = value * 24 * 60 * 60 * 1000;
            break;
          case "h":
            maxAgeMs = value * 60 * 60 * 1000;
            break;
          case "m":
            maxAgeMs = value * 60 * 1000;
            break;
          case "s":
            maxAgeMs = value * 1000;
            break;
          default:
            maxAgeMs = 0;
        }
        const cutoff = Date.now() - maxAgeMs;
        filtered = filtered.filter((r) => r.timestamp >= cutoff);
      }
    }

    // Filter by maxRecords (keep most recent)
    if (config.maxRecords !== undefined && filtered.length > config.maxRecords) {
      filtered = filtered
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, config.maxRecords)
        .sort((a, b) => a.timestamp - b.timestamp);
    }

    const removed = originalCount - filtered.length;
    if (removed > 0) {
      this.sessionStore.set(sessionId, filtered);
    }
    return removed;
  }

  /**
   * Load existing validation history for a session.
   *
   * @param sessionId - Session identifier
   * @param records - Existing validation records
   */
  loadHistory(sessionId: string, records: ValidationHistoryRecord[]): void {
    if (!this.sessionStore.has(sessionId)) {
      this.sessionStore.set(sessionId, records);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// ValidationStatsCollector
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates validation statistics from history records.
 */
export interface ValidationStats {
  /** Total number of validations */
  total: number;

  /** Number of passed validations */
  passed: number;

  /** Number of failed validations */
  failed: number;

  /** Average execution duration in ms */
  avgDurationMs: number;

  /** Statistics per rule */
  byRule: Record<
    string,
    {
      total: number;
      passed: number;
      failed: number;
    }
  >;
}

/**
 * Collects and computes validation statistics.
 */
export class ValidationStatsCollector {
  private readonly recorder: ValidationHistoryRecorder;

  constructor(recorder: ValidationHistoryRecorder) {
    this.recorder = recorder;
  }

  /**
   * Parse a time range string to milliseconds.
   * Supports: "7d", "24h", "60m", "30s"
   */
  private parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/^(\d+)([dhms])$/);
    if (match === null) {
      throw new Error(`Invalid time range format: ${timeRange}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "d":
        return value * 24 * 60 * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "m":
        return value * 60 * 1000;
      case "s":
        return value * 1000;
      default:
        throw new Error(`Unknown time range unit: ${unit}`);
    }
  }

  /**
   * Get statistics for a specific rule.
   *
   * @param sessionId - Session identifier
   * @param ruleId - Rule identifier
   * @param timeRange - Time range string (e.g., "24h", "7d", "1h")
   */
  getRuleStats(
    sessionId: string,
    ruleId: string,
    timeRange?: string
  ): { total: number; passed: number; failed: number; avgDurationMs: number } {
    const timeRangeMs = timeRange !== undefined ? this.parseTimeRange(timeRange) : undefined;
    const cutoff = timeRangeMs !== undefined ? Date.now() - timeRangeMs : 0;
    const records = this.recorder
      .getHistory(sessionId)
      .filter((r) => r.timestamp >= cutoff);

    let total = 0;
    let passed = 0;
    let failed = 0;
    let totalDuration = 0;

    for (const record of records) {
      for (const result of record.results) {
        if (result.ruleId === ruleId) {
          total++;
          if (result.passed) {
            passed++;
          } else {
            failed++;
          }
        }
      }
    }

    return {
      total,
      passed,
      failed,
      avgDurationMs: total > 0 ? totalDuration / total : 0,
    };
  }

  /**
   * Get overall statistics for plan validations.
   *
   * @param sessionId - Session identifier
   * @param timeRangeMs - Optional time range filter in milliseconds
   */
  getPlanStats(
    sessionId: string,
    timeRangeMs?: number
  ): { total: number; passed: number; failed: number; successRate: number } {
    const cutoff = timeRangeMs !== undefined ? Date.now() - timeRangeMs : 0;
    const records = this.recorder
      .getHistory(sessionId)
      .filter((r) => r.type === "plan" && r.timestamp >= cutoff);

    const total = records.length;
    const passed = records.filter((r) =>
      r.results.every((res) => res.passed)
    ).length;

    return {
      total,
      passed,
      failed: total - passed,
      successRate: total > 0 ? passed / total : 0,
    };
  }

  /**
   * Get validation statistics based on a flexible query.
   *
   * - `{ ruleId, timeRange }` → per-rule stats with optional time filter
   * - `{ type, granularity }` → aggregated success rate by time bucket
   */
  getValidationStats(
    sessionId: string,
    query:
      | { ruleId: string; timeRange?: string }
      | { type: string; granularity?: string }
  ): Record<string, unknown> {
    if ("ruleId" in query) {
      return this.getRuleStats(sessionId, query.ruleId, query.timeRange);
    }

    const granularity = query.granularity ?? "hour";
    const records = this.recorder
      .getHistory(sessionId)
      .filter((r) => r.type === query.type);

    const buckets = new Map<string, { total: number; passed: number }>();

    for (const record of records) {
      const date = new Date(record.timestamp);
      let key: string;
      if (granularity === "day") {
        key = date.toISOString().slice(0, 10); // YYYY-MM-DD
      } else {
        key = `${date.toISOString().slice(0, 13)}:00`; // YYYY-MM-DDTHH:00
      }

      const bucket = buckets.get(key) ?? { total: 0, passed: 0 };
      bucket.total++;
      const allPassed = record.results.every((res) => res.passed);
      if (allPassed) {
        bucket.passed++;
      }
      buckets.set(key, bucket);
    }

    const sortedKeys = Array.from(buckets.keys()).sort();
    const data = sortedKeys.map((key) => {
      const bucket = buckets.get(key)!;
      return {
        time: key,
        total: bucket.total,
        successRate: bucket.total > 0 ? bucket.passed / bucket.total : 0,
      };
    });

    return {
      granularity,
      type: query.type,
      data,
    };
  }

  /**
   * Get aggregated statistics for all validations.
   */
  getAllStats(sessionId: string): ValidationStats {
    const records = this.recorder.getHistory(sessionId);
    const byRule: Record<string, { total: number; passed: number; failed: number }> = {};

    let totalDuration = 0;
    let totalValidations = 0;

    for (const record of records) {
      // Track per-rule stats
      for (const result of record.results) {
        if (byRule[result.ruleId] === undefined) {
          byRule[result.ruleId] = { total: 0, passed: 0, failed: 0 };
        }
        byRule[result.ruleId].total++;
        if (result.passed) {
          byRule[result.ruleId].passed++;
        } else {
          byRule[result.ruleId].failed++;
        }
      }
      totalValidations++;
    }

    const total = records.length;
    const passed = records.filter((r) =>
      r.results.every((res) => res.passed)
    ).length;

    return {
      total,
      passed,
      failed: total - passed,
      avgDurationMs:
        totalValidations > 0 ? totalDuration / totalValidations : 0,
      byRule,
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// ValidationHistoryCleaner
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Cleans up old validation history records.
 */
export class ValidationHistoryCleaner {
  private readonly recorder: ValidationHistoryRecorder;

  constructor(recorder: ValidationHistoryRecorder) {
    this.recorder = recorder;
  }

  /**
   * Clean up validation history based on retention config.
   *
   * @param sessionId - Session identifier
   * @param config - Retention configuration
   */
  cleanup(sessionId: string, config: RetentionConfig): number {
    let records = this.recorder.getHistory(sessionId);
    const originalCount = records.length;

    // Filter by maxAge
    if (config.maxAge !== undefined) {
      const maxAgeMs = this.parseDuration(config.maxAge);
      const cutoff = Date.now() - maxAgeMs;
      records = records.filter((r) => r.timestamp >= cutoff);
    }

    // Filter by maxRecords (keep most recent)
    if (config.maxRecords !== undefined && records.length > config.maxRecords) {
      records = records
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, config.maxRecords);
    }

    const removed = originalCount - records.length;
    return removed;
  }

  /**
   * Clear all validation history before a specific date.
   *
   * @param sessionId - Session identifier
   * @param before - ISO 8601 date string or timestamp
   * @returns Number of records removed
   */
  clearBefore(sessionId: string, before: string | number): number {
    const beforeTs =
      typeof before === "string" ? new Date(before).getTime() : before;
    const records = this.recorder.getHistory(sessionId);
    const originalCount = records.length;

    const filtered = records.filter((r) => r.timestamp >= beforeTs);
    const removed = originalCount - filtered.length;

    return removed;
  }

  /**
   * Parse a duration string to milliseconds.
   * Supports: "7d", "24h", "60m", "30s"
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([dhms])$/);
    if (match === null) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "d":
        return value * 24 * 60 * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "m":
        return value * 60 * 1000;
      case "s":
        return value * 1000;
      default:
        throw new Error(`Unknown duration unit: ${unit}`);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Session Extension Helpers
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Read validation state from a session object.
 */
export function readValidationState(
  session: unknown
): ValidationHistoryRecord[] {
  if (session === null || session === undefined) {
    return [];
  }

  try {
    const s = session as Record<string, unknown>;
    let validationState: unknown = s.validation_state;
    if (
      validationState === undefined &&
      typeof s.data === "object" &&
      s.data !== null
    ) {
      validationState = (s.data as Record<string, unknown>).validation_state;
    }

    if (!Array.isArray(validationState)) {
      return [];
    }

    // Validate each record
    const records: ValidationHistoryRecord[] = [];
    for (const item of validationState) {
      try {
        const parsed = ValidationHistoryRecordSchema.parse(item);
        records.push(parsed);
      } catch {
        // Skip invalid records
      }
    }
    return records;
  } catch {
    return [];
  }
}

/**
 * Write validation state to a session object.
 */
export function writeValidationState(
  session: unknown,
  records: ValidationHistoryRecord[]
): void {
  if (session === null || session === undefined) {
    return;
  }

  try {
    const s = session as Record<string, unknown>;
    if (typeof s.data === "object" && s.data !== null) {
      (s.data as Record<string, unknown>).validation_state = records;
    } else {
      s.validation_state = records;
    }
  } catch {
    // Silently fail if session is not mutable
  }
}
