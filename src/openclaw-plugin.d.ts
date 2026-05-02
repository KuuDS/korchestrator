// openclaw-plugin.d.ts — OpenClaw Plugin SDK 类型声明

declare module "openclaw/plugin-sdk/plugin-entry" {
  import { Plan, Task } from "../types";

  export interface PluginAPI {
    config: Record<string, unknown>;
    registerSessionExtension<T>(extension: {
      id: string;
      defaultValue: T;
      onCleanup?: (reason: "reset" | "delete" | "disable" | "restart") => void;
    }): void;
    on(name: string, handler: (event: PluginEvent) => Promise<unknown | void>, options?: { priority?: number }): void;
  }

  export interface PluginEvent {
    prompt: string;
    runId: string;
    params?: Record<string, unknown>;
    result?: { content?: string };
    error?: Error;
    durationMs: number;
    success: boolean;
    task?: Task;
    context: {
      pluginConfig?: Record<string, unknown>;
      session?: {
        pluginExtensions?: {
          plan_state?: Plan;
        };
      };
      sessions: {
        pluginPatch: (id: string, value: unknown) => Promise<void>;
      };
    };
  }

  export function definePluginEntry(config: {
    id: string;
    name: string;
    register(api: PluginAPI): void;
  }): unknown;
}
