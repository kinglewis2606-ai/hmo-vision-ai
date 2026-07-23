import fs from "fs";
import { openai } from "./openai";

export async function analyseFloorPlan(filePath: string) {
  const image = fs.readFileSync(filePath);
  const base64 = image.toString("base64");

  const response = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `You are a professional UK HMO consultant.

Analyse this floor plan.

Return ONLY valid JSON in exactly this format:

{
  "summary": {
    "bedrooms": 0,
    "bathrooms": 0,
    "kitchen": false,
    "livingRoom": false,
    "stairs": false,
    "possibleHMOBedrooms": 0,
    "confidence": "High"
  },
  "hmoScore": 0,
  "verdict": "",
  "recommendations": [],
  "compliance": [],
  "estimatedConversionCost": {
    "low": 0,
    "high": 0
  },
  "estimatedMonthlyRent": 0
}`
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${base64}`,
            detail: "high"
          }
        ]
      }
    ]
  });

  return response.output_text;
}