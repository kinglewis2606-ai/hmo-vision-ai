import OpenAI from "openai";

/**
 * Keep the client lazy. Next.js evaluates route modules during `next build`,
 * so constructing OpenAI at module scope makes CI fail when the secret is not
 * available. The API route can keep using `openai.responses.create(...)`.
 *
 * The analysis route currently requests gpt-5 with a full annotated floor-plan
 * image. That request was repeatedly exceeding the application's 4-minute
 * client timeout. Geometry recognition already uses gpt-5-mini; use the same
 * fast model for the image-heavy analysis call so an upload can complete in a
 * predictable time. Text/JSON-only calls keep their requested model.
 */
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  return new OpenAI({ apiKey });
}

export const openai = {
  get responses() {
    const client = getClient();
    return {
      ...client.responses,
      create: (params: any, options?: any) => {
        const nextParams = params?.model === "gpt-5"
          ? { ...params, model: "gpt-5-mini" }
          : params;
        return client.responses.create(nextParams, options);
      },
    };
  },
} as unknown as OpenAI;
