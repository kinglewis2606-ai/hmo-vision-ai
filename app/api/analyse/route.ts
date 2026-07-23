import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { filename } = await req.json();

    const filePath = path.join(process.cwd(), "uploads", filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: "Uploaded file not found",
      });
    }

    const image = fs.readFileSync(filePath);
    const base64 = image.toString("base64");

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Analyse this floor plan.

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
                  image_url: `data:image/jpeg;base64,${base64}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    console.log(data);

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: JSON.stringify(data),
      });
    }

    return NextResponse.json({
      success: true,
      result: data.output_text,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }
}