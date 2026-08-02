import fs from "fs";

export async function loadImage(imagePath: string): Promise<Buffer> {
  console.log("Loading image:", imagePath);

  return fs.readFileSync(imagePath);
}
