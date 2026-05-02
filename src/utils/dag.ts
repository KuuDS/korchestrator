// utils/dag.ts — DAG 验证（独立模块，方便测试）

import { Task } from "../types";

/**
 * 验证任务列表的依赖关系是否构成无环有向图（DAG）
 * @param tasks 任务列表
 * @throws Error 当发现循环依赖或不存在的依赖时抛出
 */
export function validateDAG(tasks: Task[]): void {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  function visit(id: string): boolean {
    if (recursionStack.has(id)) return false;
    if (visited.has(id)) return true;

    visited.add(id);
    recursionStack.add(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependencies) {
        if (!taskMap.has(dep)) {
          throw new Error(`Task ${id} depends on non-existent task ${dep}`);
        }
        if (!visit(dep)) {
          throw new Error(`Circular dependency detected involving task ${id}`);
        }
      }
    }

    recursionStack.delete(id);
    return true;
  }

  for (const task of tasks) {
    visit(task.id);
  }
}

/**
 * 检查任务列表是否有循环依赖
 * @param tasks 任务列表
 * @returns true 如果有环，false 如果无环
 */
export function hasCycle(tasks: Task[]): boolean {
  try {
    validateDAG(tasks);
    return false;
  } catch {
    return true;
  }
}

/**
 * 获取指定任务的直接依赖任务
 * @param taskId 任务ID
 * @param tasks 所有任务
 * @returns 依赖任务列表
 */
export function getDependencies(taskId: string, tasks: Task[]): Task[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const task = taskMap.get(taskId);
  if (!task) return [];
  return task.dependencies.map(depId => taskMap.get(depId)).filter((t): t is Task => t !== undefined);
}

/**
 * 获取指定任务的直接下游任务
 * @param taskId 任务ID
 * @param tasks 所有任务
 * @returns 下游任务列表
 */
export function getDependents(taskId: string, tasks: Task[]): Task[] {
  return tasks.filter(t => t.dependencies.includes(taskId));
}
