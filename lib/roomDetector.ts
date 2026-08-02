import cv from "opencv.js";

export interface DetectedRoom {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function detectRooms(imagePath: string) {
  console.log("Room detection started:", imagePath);

  const image = await cv.imreadAsync(imagePath);

  const gray = new cv.Mat();
  cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);

  const binary = new cv.Mat();
  cv.threshold(
    gray,
    binary,
    200,
    255,
    cv.THRESH_BINARY_INV
  );

  console.log(
    "Image processed:",
    binary.cols,
    "x",
    binary.rows
  );

  image.delete();
  gray.delete();
  binary.delete();

  return [];
}
