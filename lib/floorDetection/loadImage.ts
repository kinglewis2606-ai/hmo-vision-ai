import fs from "fs/promises";

export async function loadImage(imagePath: string): Promise<Buffer> {
  return await fs.readFile(imagePath);
}
