import { openai } from "./openai";

export async function analyseFloorPlan(imageUrl: string) {
  const response = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `You are an experienced UK HMO surveyor.

Analyse this floor plan.

Return ONLY valid JSON.

{
  "bedrooms": 0,
  "bathrooms": 0,
  "kitchen": false,
  "livingRoom": false,
  "stairs": false,
  "possibleHMOBedrooms": 0,
  "confidence": "High"
}`,
          },
          {
            type: "input_image",
            image_url: imageUrl,
            detail: "high",
          },
        ],
      },
    ],
  });

  return response.output_text;
}
