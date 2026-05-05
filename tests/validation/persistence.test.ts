/**
 * Validation Persistence Layer Tests
 *
 * Comprehensive test suite for validation history recording, statistics,
 * cleanup, and session state persistence.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ValidationHistoryRecorder,
  ValidationStatsCollector,
  ValidationHistoryCleaner,
  readValidationState,
  writeValidationState,
} from "../../src/validation/persistence.js";
import type {
  ValidationReport,
  ValidationHistoryRecord,
  RetentionConfig,
} from "../../src/validation/types.js";

// ───────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ───────────────────────────────────────────────────────────────────────────────

function createMockReport(
  overrides: Partial<ValidationReport> = {}
): ValidationReport {
  return {
    valid: true,
    results: [
      {
        passed: true,
        ruleId: "rule-1",
        message: "Rule passed",
      },
    ],
    timestamp: Date.now(),
    durationMs: 10,
    ...overrides,
  };
}

function createMockRecord(
  overrides: Partial<ValidationHistoryRecord> = {}
): ValidationHistoryRecord {
  return {
    id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    type: "plan",
    planId: "plan-1",
    results: [
      { passed: true, ruleId: "rule-1", message: "Passed" },
    ],
    ...overrides,
  };
}

function createMixedResultsReport(
  timestamp: number,
  ...results: { ruleId: string; passed: boolean; severity?: "error" | "warning" }[]
): ValidationReport {
  return {
    valid: results.every((r) => r.passed),
    results: results.map((r) => ({
      passed: r.passed,
      ruleId: r.ruleId,
      message: `${r.ruleId} ${r.passed ? "passed" : "failed"}`,
      severity: r.severity,
    })),
    timestamp,
    durationMs: 5,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// ValidationHistoryRecorder Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("ValidationHistoryRecorder", () => {
  let recorder: ValidationHistoryRecorder;
  let store: Map<string, ValidationHistoryRecord[]>;

  beforeEach(() => {
    store = new Map();
    recorder = new ValidationHistoryRecorder(store);
  });

  describe("recordPlanValidation", () => {
    it("should record a plan validation and return the record", () => {
      const sessionId = "session-1";
      const planId = "plan-1";
      const report = createMockReport();

      const record = recorder.recordPlanValidation(sessionId, planId, report);

      expect(record.type).toBe("plan");
      expect(record.planId).toBe(planId);
      expect(record.timestamp).toBe(report.timestamp);
      expect(record.results).toEqual(report.results);
      expect(record.id).toMatch(/^val_\d+_[a-z0-9]+$/);
    });

    it("should store records in the session store", () => {
      const sessionId = "session-1";
      const report = createMockReport();

      recorder.recordPlanValidation(sessionId, "plan-1", report);
      recorder.recordPlanValidation(sessionId, "plan-2", report);

      const history = recorder.getHistory(sessionId);
      expect(history).toHaveLength(2);
    });

    it("should isolate records between sessions", () => {
      const report = createMockReport();

      recorder.recordPlanValidation("session-a", "plan-1", report);
      recorder.recordPlanValidation("session-b", "plan-1", report);

      expect(recorder.getHistory("session-a")).toHaveLength(1);
      expect(recorder.getHistory("session-b")).toHaveLength(1);
    });
  });

  describe("recordTaskValidation", () => {
    it("should record a task validation and return the record", () => {
      const sessionId = "session-1";
      const taskId = "task-1";
      const agentId = "agent-1";
      const report = createMockReport();

      const record = recorder.recordTaskValidation(sessionId, taskId, agentId, report);

      expect(record.type).toBe("task");
      expect(record.taskId).toBe(taskId);
      expect(record.agentId).toBe(agentId);
      expect(record.timestamp).toBe(report.timestamp);
    });

    it("should store task records alongside plan records", () => {
      const sessionId = "session-1";
      const report = createMockReport();

      recorder.recordPlanValidation(sessionId, "plan-1", report);
      recorder.recordTaskValidation(sessionId, "task-1", "agent-1", report);

      const history = recorder.getHistory(sessionId);
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe("plan");
      expect(history[1].type).toBe("task");
    });
  });

  describe("getHistory", () => {
    it("should return an empty array for unknown session", () => {
      expect(recorder.getHistory("unknown")).toEqual([]);
    });

    it("should return a copy of the records (mutation-safe)", () => {
      const sessionId = "session-1";
      recorder.recordPlanValidation(sessionId, "plan-1", createMockReport());

      const history = recorder.getHistory(sessionId);
      history.push(createMockRecord());

      expect(recorder.getHistory(sessionId)).toHaveLength(1);
    });

    it("should return records in insertion order", () => {
      const sessionId = "session-1";
      const t1 = Date.now() - 2000;
      const t2 = Date.now() - 1000;
      const t3 = Date.now();

      recorder.recordPlanValidation(sessionId, "plan-1", createMockReport({ timestamp: t1 }));
      recorder.recordPlanValidation(sessionId, "plan-2", createMockReport({ timestamp: t2 }));
      recorder.recordPlanValidation(sessionId, "plan-3", createMockReport({ timestamp: t3 }));

      const history = recorder.getHistory(sessionId);
      expect(history[0].timestamp).toBe(t1);
      expect(history[1].timestamp).toBe(t2);
      expect(history[2].timestamp).toBe(t3);
    });
  });

  describe("getPlanHistory", () => {
    it("should filter by plan ID", () => {
      const sessionId = "session-1";
      const report = createMockReport();

      recorder.recordPlanValidation(sessionId, "plan-a", report);
      recorder.recordPlanValidation(sessionId, "plan-b", report);
      recorder.recordTaskValidation(sessionId, "task-1", "agent-1", report);

      const planHistory = recorder.getPlanHistory(sessionId, "plan-a");
      expect(planHistory).toHaveLength(1);
      expect(planHistory[0].planId).toBe("plan-a");
    });

    it("should return empty array for non-existent plan", () => {
      recorder.recordPlanValidation("session-1", "plan-1", createMockReport());
      expect(recorder.getPlanHistory("session-1", "non-existent")).toEqual([]);
    });

    it("should not include task records", () => {
      const sessionId = "session-1";
      const report = createMockReport();

      recorder.recordPlanValidation(sessionId, "plan-1", report);
      recorder.recordTaskValidation(sessionId, "task-1", "agent-1", report);

      expect(recorder.getPlanHistory(sessionId, "plan-1")).toHaveLength(1);
    });
  });

  describe("getTaskHistory", () => {
    it("should filter by task ID", () => {
      const sessionId = "session-1";
      const report = createMockReport();

      recorder.recordTaskValidation(sessionId, "task-a", "agent-1", report);
      recorder.recordTaskValidation(sessionId, "task-b", "agent-2", report);
      recorder.recordPlanValidation(sessionId, "plan-1", report);

      const taskHistory = recorder.getTaskHistory(sessionId, "task-a");
      expect(taskHistory).toHaveLength(1);
      expect(taskHistory[0].taskId).toBe("task-a");
    });

    it("should return empty array for non-existent task", () => {
      recorder.recordTaskValidation("session-1", "task-1", "agent-1", createMockReport());
      expect(recorder.getTaskHistory("session-1", "non-existent")).toEqual([]);
    });

    it("should not include plan records", () => {
      const sessionId = "session-1";
      const report = createMockReport();

      recorder.recordPlanValidation(sessionId, "plan-1", report);
      recorder.recordTaskValidation(sessionId, "task-1", "agent-1", report);

      expect(recorder.getTaskHistory(sessionId, "task-1")).toHaveLength(1);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// ValidationStatsCollector Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("ValidationStatsCollector", () => {
  let recorder: ValidationHistoryRecorder;
  let statsCollector: ValidationStatsCollector;

  beforeEach(() => {
    recorder = new ValidationHistoryRecorder();
    statsCollector = new ValidationStatsCollector(recorder);
  });

  describe("getRuleStats", () => {
    it("should return zero stats for empty history", () => {
      const stats = statsCollector.getRuleStats("session-1", "rule-1");
      expect(stats).toEqual({ total: 0, passed: 0, failed: 0, avgDurationMs: 0 });
    });

    it("should count passes and failures for a specific rule", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(now, { ruleId: "rule-a", passed: true }, { ruleId: "rule-b", passed: false })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMixedResultsReport(now, { ruleId: "rule-a", passed: true }, { ruleId: "rule-a", passed: false })
      );

      const stats = statsCollector.getRuleStats(sessionId, "rule-a");
      expect(stats.total).toBe(3);
      expect(stats.passed).toBe(2);
      expect(stats.failed).toBe(1);
    });

    it("should filter by time range", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(now - 10000, { ruleId: "rule-a", passed: true })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMixedResultsReport(now - 1000, { ruleId: "rule-a", passed: false })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-3",
        createMixedResultsReport(now, { ruleId: "rule-a", passed: true })
      );

      const stats = statsCollector.getRuleStats(sessionId, "rule-a", 5000);
      expect(stats.total).toBe(2);
    });

    it("should include all records when no time range is specified", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(now - 100000, { ruleId: "rule-a", passed: true })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMixedResultsReport(now, { ruleId: "rule-a", passed: false })
      );

      const stats = statsCollector.getRuleStats(sessionId, "rule-a");
      expect(stats.total).toBe(2);
    });

    it("should calculate avgDurationMs as 0 (duration not tracked per-result)", () => {
      const sessionId = "session-1";
      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(Date.now(), { ruleId: "rule-a", passed: true })
      );

      const stats = statsCollector.getRuleStats(sessionId, "rule-a");
      expect(stats.avgDurationMs).toBe(0);
    });
  });

  describe("getPlanStats", () => {
    it("should return zero stats for empty history", () => {
      const stats = statsCollector.getPlanStats("session-1");
      expect(stats).toEqual({ total: 0, passed: 0, failed: 0, successRate: 0 });
    });

    it("should count passed and failed plan validations", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(now, { ruleId: "rule-1", passed: true })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMixedResultsReport(now, { ruleId: "rule-1", passed: false })
      );
      recorder.recordTaskValidation(
        sessionId,
        "task-1",
        "agent-1",
        createMixedResultsReport(now, { ruleId: "rule-1", passed: false })
      );

      const stats = statsCollector.getPlanStats(sessionId);
      expect(stats.total).toBe(2);
      expect(stats.passed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe(0.5);
    });

    it("should consider a plan passed only if ALL results pass", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(
          now,
          { ruleId: "rule-1", passed: true },
          { ruleId: "rule-2", passed: false }
        )
      );

      const stats = statsCollector.getPlanStats(sessionId);
      expect(stats.passed).toBe(0);
      expect(stats.failed).toBe(1);
    });

    it("should filter by time range", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(now - 10000, { ruleId: "rule-1", passed: true })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMixedResultsReport(now - 1000, { ruleId: "rule-1", passed: true })
      );

      const stats = statsCollector.getPlanStats(sessionId, 5000);
      expect(stats.total).toBe(1);
    });
  });

  describe("getAllStats", () => {
    it("should return zero stats for empty history", () => {
      const stats = statsCollector.getAllStats("session-1");
      expect(stats.total).toBe(0);
      expect(stats.passed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
      expect(stats.byRule).toEqual({});
    });

    it("should aggregate per-rule statistics", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(
          now,
          { ruleId: "rule-a", passed: true },
          { ruleId: "rule-b", passed: false }
        )
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMixedResultsReport(
          now,
          { ruleId: "rule-a", passed: true },
          { ruleId: "rule-a", passed: false }
        )
      );

      const stats = statsCollector.getAllStats(sessionId);
      expect(stats.byRule["rule-a"]).toEqual({ total: 3, passed: 2, failed: 1 });
      expect(stats.byRule["rule-b"]).toEqual({ total: 1, passed: 0, failed: 1 });
    });

    it("should count total validations (not individual results)", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(
          now,
          { ruleId: "rule-1", passed: true },
          { ruleId: "rule-2", passed: true }
        )
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMixedResultsReport(now, { ruleId: "rule-1", passed: false })
      );

      const stats = statsCollector.getAllStats(sessionId);
      expect(stats.total).toBe(2);
      expect(stats.passed).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it("should include task validations in stats", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMixedResultsReport(now, { ruleId: "rule-1", passed: true })
      );
      recorder.recordTaskValidation(
        sessionId,
        "task-1",
        "agent-1",
        createMixedResultsReport(now, { ruleId: "rule-1", passed: false })
      );

      const stats = statsCollector.getAllStats(sessionId);
      expect(stats.total).toBe(2);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// ValidationHistoryCleaner Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("ValidationHistoryCleaner", () => {
  let recorder: ValidationHistoryRecorder;
  let cleaner: ValidationHistoryCleaner;

  beforeEach(() => {
    recorder = new ValidationHistoryRecorder();
    cleaner = new ValidationHistoryCleaner(recorder);
  });

  describe("cleanup with maxAge", () => {
    it("should remove records older than maxAge", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMockReport({ timestamp: now - 86400000 * 2 }) // 2 days old
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMockReport({ timestamp: now - 3600000 }) // 1 hour old
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-3",
        createMockReport({ timestamp: now }) // now
      );

      const config: RetentionConfig = { maxAge: "1d" };
      const removed = cleaner.cleanup(sessionId, config);

      expect(removed).toBe(1);
    });

    it("should handle empty history", () => {
      const config: RetentionConfig = { maxAge: "7d" };
      const removed = cleaner.cleanup("empty-session", config);
      expect(removed).toBe(0);
    });

    it("should support various duration formats", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMockReport({ timestamp: now - 4000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMockReport({ timestamp: now - 1000 })
      );

      expect(cleaner.cleanup(sessionId, { maxAge: "5s" })).toBe(0);
      expect(cleaner.cleanup(sessionId, { maxAge: "2s" })).toBe(1);
    });

    it("should throw on invalid duration format", () => {
      const sessionId = "session-1";
      recorder.recordPlanValidation(sessionId, "plan-1", createMockReport());

      expect(() => cleaner.cleanup(sessionId, { maxAge: "invalid" })).toThrow(
        "Invalid duration format: invalid"
      );
    });
  });

  describe("cleanup with maxRecords", () => {
    it("should keep only the most recent N records", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMockReport({ timestamp: now - 2000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMockReport({ timestamp: now - 1000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-3",
        createMockReport({ timestamp: now })
      );

      const config: RetentionConfig = { maxRecords: 2 };
      const removed = cleaner.cleanup(sessionId, config);

      expect(removed).toBe(1);
    });

    it("should not remove when record count is within limit", () => {
      const sessionId = "session-1";
      recorder.recordPlanValidation(sessionId, "plan-1", createMockReport());

      const config: RetentionConfig = { maxRecords: 5 };
      const removed = cleaner.cleanup(sessionId, config);

      expect(removed).toBe(0);
    });

    it("should handle maxRecords of 0 correctly (removes all)", () => {
      const sessionId = "session-1";
      recorder.recordPlanValidation(sessionId, "plan-1", createMockReport());
      recorder.recordPlanValidation(sessionId, "plan-2", createMockReport());

      const config: RetentionConfig = { maxRecords: 0 };
      const removed = cleaner.cleanup(sessionId, config);

      expect(removed).toBe(2);
    });
  });

  describe("cleanup with combined maxAge and maxRecords", () => {
    it("should apply both filters", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMockReport({ timestamp: now - 86400000 * 10 }) // 10 days old
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMockReport({ timestamp: now - 3600000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-3",
        createMockReport({ timestamp: now - 1800000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-4",
        createMockReport({ timestamp: now })
      );

      const config: RetentionConfig = { maxAge: "7d", maxRecords: 2 };
      const removed = cleaner.cleanup(sessionId, config);

      // 1 removed by age, then 1 more by maxRecords (4 -> 3 -> 2)
      expect(removed).toBe(2);
    });
  });

  describe("clearBefore", () => {
    it("should remove records before a timestamp", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMockReport({ timestamp: now - 10000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMockReport({ timestamp: now - 5000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-3",
        createMockReport({ timestamp: now })
      );

      const removed = cleaner.clearBefore(sessionId, now - 7000);
      expect(removed).toBe(1);
    });

    it("should accept ISO 8601 date strings", () => {
      const sessionId = "session-1";
      const now = new Date("2024-01-15T12:00:00Z");
      const before = new Date("2024-01-15T10:00:00Z");

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMockReport({ timestamp: before.getTime() - 3600000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMockReport({ timestamp: now.getTime() })
      );

      const removed = cleaner.clearBefore(sessionId, before.toISOString());
      expect(removed).toBe(1);
    });

    it("should return 0 for empty history", () => {
      expect(cleaner.clearBefore("empty", Date.now())).toBe(0);
    });

    it("should remove all records when before is in the future", () => {
      const sessionId = "session-1";
      const now = Date.now();

      recorder.recordPlanValidation(
        sessionId,
        "plan-1",
        createMockReport({ timestamp: now - 1000 })
      );
      recorder.recordPlanValidation(
        sessionId,
        "plan-2",
        createMockReport({ timestamp: now })
      );

      const removed = cleaner.clearBefore(sessionId, now + 10000);
      expect(removed).toBe(2);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// readValidationState & writeValidationState Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("readValidationState", () => {
  it("should return empty array for null/undefined session", () => {
    expect(readValidationState(null)).toEqual([]);
    expect(readValidationState(undefined)).toEqual([]);
  });

  it("should return empty array when validation_state is missing", () => {
    const session = { id: "session-1" };
    expect(readValidationState(session)).toEqual([]);
  });

  it("should read from session.data.validation_state", () => {
    const record = createMockRecord();
    const session = {
      id: "session-1",
      data: {
        validation_state: [record],
      },
    };

    const result = readValidationState(session);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(record.id);
  });

  it("should read from session.validation_state directly", () => {
    const record = createMockRecord();
    const session = {
      id: "session-1",
      validation_state: [record],
    };

    const result = readValidationState(session);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(record.id);
  });

  it("should prefer root validation_state over data.validation_state", () => {
    const record1 = createMockRecord({ planId: "from-data" });
    const record2 = createMockRecord({ planId: "from-root" });

    const session = {
      id: "session-1",
      data: {
        validation_state: [record1],
      },
      validation_state: [record2],
    };

    const result = readValidationState(session);
    expect(result).toHaveLength(1);
    expect(result[0].planId).toBe("from-root");
  });

  it("should skip invalid records", () => {
    const validRecord = createMockRecord();
    const session = {
      id: "session-1",
      data: {
        validation_state: [
          validRecord,
          { id: "invalid", timestamp: "not-a-number", type: "plan", results: [] },
          null,
        ],
      },
    };

    const result = readValidationState(session);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(validRecord.id);
  });

  it("should return empty array when validation_state is not an array", () => {
    const session = {
      id: "session-1",
      data: {
        validation_state: "not-an-array",
      },
    };

    expect(readValidationState(session)).toEqual([]);
  });

  it("should handle nested results with severity and metadata", () => {
    const session = {
      id: "session-1",
      data: {
        validation_state: [
          {
            id: "val-1",
            timestamp: 1700000000000,
            type: "plan",
            planId: "plan-1",
            results: [
              {
                passed: false,
                ruleId: "rule-1",
                message: "Failed",
                severity: "error",
                metadata: { detail: "something went wrong" },
              },
            ],
          },
        ],
      },
    };

    const result = readValidationState(session);
    expect(result).toHaveLength(1);
    expect(result[0].results[0].severity).toBe("error");
    expect(result[0].results[0].metadata).toEqual({ detail: "something went wrong" });
  });
});

describe("writeValidationState", () => {
  it("should do nothing for null/undefined session", () => {
    const records = [createMockRecord()];
    expect(() => writeValidationState(null, records)).not.toThrow();
    expect(() => writeValidationState(undefined, records)).not.toThrow();
  });

  it("should write to session.data.validation_state when data exists", () => {
    const session = {
      id: "session-1",
      data: {},
    };
    const records = [createMockRecord()];

    writeValidationState(session, records);
    expect(session.data.validation_state).toBe(records);
  });

  it("should write to session.validation_state when data is absent", () => {
    const session = {
      id: "session-1",
    };
    const records = [createMockRecord()];

    writeValidationState(session, records);
    expect(session.validation_state).toBe(records);
  });

  it("should overwrite existing state", () => {
    const session = {
      id: "session-1",
      data: {
        validation_state: [createMockRecord()],
      },
    };
    const newRecords = [createMockRecord(), createMockRecord()];

    writeValidationState(session, newRecords);
    expect(session.data.validation_state).toBe(newRecords);
    expect(session.data.validation_state).toHaveLength(2);
  });

  it("should handle frozen/immutable session gracefully", () => {
    const session = Object.freeze({ id: "session-1" });
    expect(() => writeValidationState(session, [])).not.toThrow();
  });

  it("should write empty array", () => {
    const session = {
      id: "session-1",
      data: {},
    };

    writeValidationState(session, []);
    expect(session.data.validation_state).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Integration Tests
// ───────────────────────────────────────────────────────────────────────────────

describe("Validation Persistence Integration", () => {
  it("should support full workflow: record -> stats -> cleanup -> state persistence", () => {
    const sessionId = "integration-session";
    const now = Date.now();

    // Create recorder and record some validations
    const recorder = new ValidationHistoryRecorder();
    const statsCollector = new ValidationStatsCollector(recorder);

    recorder.recordPlanValidation(
      sessionId,
      "plan-1",
      createMixedResultsReport(
        now - 5000,
        { ruleId: "no-empty-tasks", passed: true },
        { ruleId: "max-depth", passed: true }
      )
    );

    recorder.recordTaskValidation(
      sessionId,
      "task-1",
      "coder",
      createMixedResultsReport(
        now - 2000,
        { ruleId: "no-empty-tasks", passed: false, severity: "error" },
        { ruleId: "has-inputs", passed: true }
      )
    );

    recorder.recordPlanValidation(
      sessionId,
      "plan-2",
      createMixedResultsReport(
        now,
        { ruleId: "no-empty-tasks", passed: true },
        { ruleId: "max-depth", passed: false, severity: "warning" }
      )
    );

    // Verify history
    const allHistory = recorder.getHistory(sessionId);
    expect(allHistory).toHaveLength(3);

    // Verify plan-specific history
    expect(recorder.getPlanHistory(sessionId, "plan-1")).toHaveLength(1);
    expect(recorder.getPlanHistory(sessionId, "nonexistent")).toHaveLength(0);

    // Verify task-specific history
    expect(recorder.getTaskHistory(sessionId, "task-1")).toHaveLength(1);
    expect(recorder.getTaskHistory(sessionId, "nonexistent")).toHaveLength(0);

    // Verify stats
    const allStats = statsCollector.getAllStats(sessionId);
    expect(allStats.total).toBe(3);
    expect(allStats.passed).toBe(1); // only plan-1 passed fully
    expect(allStats.failed).toBe(2);
    expect(allStats.byRule["no-empty-tasks"]).toEqual({ total: 3, passed: 2, failed: 1 });

    const planStats = statsCollector.getPlanStats(sessionId);
    expect(planStats.total).toBe(2);
    expect(planStats.successRate).toBe(0.5);

    const ruleStats = statsCollector.getRuleStats(sessionId, "no-empty-tasks");
    expect(ruleStats.total).toBe(3);
    expect(ruleStats.passed).toBe(2);

    // Verify time-filtered stats
    const recentRuleStats = statsCollector.getRuleStats(sessionId, "no-empty-tasks", 3000);
    expect(recentRuleStats.total).toBe(2);

    // Verify state persistence
    const session = { id: sessionId, data: {} };
    writeValidationState(session, allHistory);
    const readState = readValidationState(session);
    expect(readState).toHaveLength(3);
    expect(readState[0].type).toBe("plan");
    expect(readState[1].type).toBe("task");
  });

  it("should handle concurrent session isolation", () => {
    const recorder = new ValidationHistoryRecorder();
    const report = createMockReport();

    recorder.recordPlanValidation("session-a", "plan-1", report);
    recorder.recordPlanValidation("session-b", "plan-1", report);
    recorder.recordTaskValidation("session-a", "task-1", "agent-1", report);

    expect(recorder.getHistory("session-a")).toHaveLength(2);
    expect(recorder.getHistory("session-b")).toHaveLength(1);
    expect(recorder.getHistory("session-c")).toHaveLength(0);
  });
});
