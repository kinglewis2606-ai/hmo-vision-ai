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

Analyse this floor plan as if you were advising a property investor.

Return ONLY valid JSON.

Do NOT wrap the JSON in markdown.
Do NOT include any explanation before or after the JSON.

Return EXACTLY this structure:

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

  "investmentRating": "Excellent",

  "verdict": "",

  "recommendations": [],

  "compliance": [],

  "estimatedConversionCost": {
    "low": 0,
    "high": 0
  },

  "estimatedMonthlyRent": 0,

  "investorSnapshot": {
    "estimatedBedrooms": 0,
    "estimatedConversionCost": 0,
    "estimatedAnnualRent": 0,
    "estimatedGrossYield": 0,
    "investmentRating": "Excellent"
  }
}

Rules:

- Estimate realistic UK HMO figures.
- Annual rent = monthly rent × 12.
- Conversion cost should match the estimated conversion range.
- Gross yield should be a realistic percentage.
- Investment rating must be one of:
  Excellent
  Good
  Fair
  Poor

Return JSON only.
`
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
