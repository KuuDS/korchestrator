/**
 * Moonshot (Kimi) LLM client factory.
 *
 * Provides an OpenAI-compatible chat completions interface over
 * the Moonshot API.  The returned generate function is suitable for
 * injection into Planner and Replanner.
 */

export interface LlmClientConfig {
  /** Moonshot API key */
  apiKey: string;

  /** Base URL for the API (defaults to Moonshot endpoint) */
  baseUrl?: string;

  /** Model identifier, e.g. moonshot-v1-8k */
  model: string;

  /** Optional logger for diagnostic output */
  logger?: {
    warn: (msg: string) => void;
    error: (msg: string) => void;
    info?: (msg: string) => void;
  };
}

/** Minimal shape of the Moonshot chat completions response we care about. */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Create a generate function that calls the Moonshot API.
 *
 * @param config - Client configuration
 * @returns A function that accepts a prompt string and returns the LLM text
 * @throws When the API key is missing, the HTTP request fails, or the
 *         response cannot be parsed.
 */
export function createLlmClient(
  config: LlmClientConfig
): (prompt: string) => Promise<string> {
  const { apiKey, model, logger } = config;
  const baseUrl = config.baseUrl ?? "https://api.moonshot.cn/v1";

  if (apiKey.length === 0) {
    const msg = "MOONSHOT_API_KEY is empty — cannot create LLM client";
    logger?.warn(msg);
    throw new Error(msg);
  }

  return async (prompt: string): Promise<string> => {
    const url = `${baseUrl}/chat/completions`;
    const body = {
      model,
      messages: [{ role: "user" as const, content: prompt }],
      temperature: 0.3,
    };

    logger?.info?.(`[LLM] Calling ${model} at ${baseUrl} (prompt ${prompt.length} chars)`);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger?.error(`[LLM] Network error: ${msg}`);
      throw new Error(`Moonshot API network error: ${msg}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "<unreadable>");
      logger?.error(`[LLM] HTTP ${response.status}: ${text}`);
      throw new Error(`Moonshot API HTTP ${response.status}: ${text}`);
    }

    let data: unknown;
    try {
      data = (await response.json()) as unknown;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger?.error(`[LLM] JSON parse error: ${msg}`);
      throw new Error(`Moonshot API JSON parse error: ${msg}`);
    }

    const parsed = data as ChatCompletionResponse;
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      const msg = "Moonshot API response missing content";
      logger?.error(`[LLM] ${msg}`);
      throw new Error(msg);
    }

    logger?.info?.(`[LLM] Received ${content.length} chars`);
    return content;
  };
}
