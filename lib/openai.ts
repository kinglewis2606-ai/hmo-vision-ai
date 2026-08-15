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

// The HMO analysis can legitimately perform several vision/geometry passes.
// The browser, Next route and Nginx are now aligned to allow the complete
// request to finish instead of the browser disconnecting while the server is
// still working.
const OPENAI_REQUEST_TIMEOUT_MS = 120_000;

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
