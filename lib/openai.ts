import OpenAI from "openai";

/**
 * Create the OpenAI client only when the API route actually executes.
 * Next.js evaluates route modules during `next build`; constructing the
 * client at module scope makes a production build fail when CI has no secret.
 */
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  return new OpenAI({ apiKey });
}
