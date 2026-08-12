import OpenAI from "openai";

/**
 * Keep the client lazy. Next.js evaluates route modules during `next build`,
 * so constructing OpenAI at module scope makes CI fail when the secret is not
 * available. The API route can keep using `openai.responses.create(...)`.
 */
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  return new OpenAI({ apiKey });
}

export const openai = {
  get responses() {
    return getClient().responses;
  },
} as unknown as OpenAI;
