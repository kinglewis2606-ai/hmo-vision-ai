"use client";

import Image from "next/image";

type OverlayBox = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colour?: string;
};

type Props = {
  imageUrl: string;
  boxes: OverlayBox[];
};

export default function FloorPlanOverlay({
  imageUrl,
  boxes,
}: Props) {
  return (
    <div className="relative w-full overflow-auto rounded-xl border bg-white">
      <Image
        src={imageUrl}
        alt="Floor Plan"
        width={1200}
        height={1600}
        className="w-full h-auto"
      />

      <div className="absolute inset-0">
        {boxes.map((box, index) => (
          <div
            key={index}
            className="absolute border-2 rounded-md flex items-center justify-center text-xs font-bold text-white"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              backgroundColor: box.colour ?? "rgba(59,130,246,0.35)",
              borderColor: "#2563eb",
            }}
          >
            {box.label}
          </div>
        ))}
      </div>
    </div>
  );
}
