import { readFile } from "node:fs/promises";
import { watch, type FSWatcher } from "chokidar";

/**
 * Read and parse a JSON configuration file.
 * @param configPath - Absolute path to the JSON config file.
 * @returns Parsed JSON as unknown.
 * @throws If the file cannot be read or parsed.
 */
export async function loadConfigFile(configPath: string): Promise<unknown> {
  const content = await readFile(configPath, "utf-8");
  return JSON.parse(content) as unknown;
}

/**
 * Watch a config file for changes with debounce.
 * @param configPath - Absolute path to the config file.
 * @param onChange - Callback invoked after the file changes (debounced).
 * @returns Object with stop() to close the watcher.
 */
export function watchConfig(
  configPath: string,
  onChange: () => void
): { stop: () => void } {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher: FSWatcher = watch(configPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  watcher.on("change", () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChange();
    }, 300);
  });

  return {
    stop: () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      void watcher.close();
    }
  };
}
