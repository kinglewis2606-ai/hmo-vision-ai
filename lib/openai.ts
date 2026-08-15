import OpenAI from "openai";

/**
 * Keep the client lazy. Next.js evaluates route modules during `next build`,
 * so constructing OpenAI at module scope makes CI fail when the secret is not
 * available.
 */
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  return new OpenAI({ apiKey });
}

// The browser waits just under five minutes. Keep each upstream vision call
// bounded so the route either returns a normal error or completes before the
// browser/Nginx connection can be abandoned. The analysis pipeline has at most
// three sequential OpenAI passes (primary, JSON retry, label recovery), so the
// worst-case upstream time remains below the browser's current 290s guard.
const OPENAI_REQUEST_TIMEOUT_MS = 90_000;

export const openai = {
  get responses() {
    const client = getClient();
    return {
      ...client.responses,
      create: (params: any, options?: any) => {
        const nextParams = params?.model === "gpt-5"
          ? {
              ...params,
              model: "gpt-5-mini",
              max_output_tokens: Math.min(Number(params.max_output_tokens ?? 5000), 6000),
            }
          : params;
        const requestOptions = {
          ...(options || {}),
          signal: options?.signal || AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
        };
        return client.responses.create(nextParams, requestOptions);
      },
    };
  },
} as unknown as OpenAI;
