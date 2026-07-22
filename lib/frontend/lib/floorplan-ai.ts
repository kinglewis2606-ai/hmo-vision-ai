import fs from "fs";
import { openai } from "./openai";

export async function analyseFloorPlan(filePath: string) {
  const image = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: "vision",
  });

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
}`
          },
          {
            type: "input_image",
            file_id: image.id,
          },
        ],
      },
    ],
  });

  return JSON.parse(response.output_text);
}
