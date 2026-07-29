"use client";

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  type?: "bedroom" | "kitchen" | "bathroom" | "communal";
};

export default function FloorPlanOverlay({
  imageUrl,
  boxes,
}: {
  imageUrl: string;
  boxes: Box[];
}) {
  const colours = {
    bedroom: "rgba(37,99,235,0.55)",
    kitchen: "rgba(22,163,74,0.55)",
    bathroom: "rgba(168,85,247,0.55)",
    communal: "rgba(245,158,11,0.55)",
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <img
        src={imageUrl}
        alt="Floor Plan"
        className="block h-auto w-full"
        draggable={false}
      />

      {boxes.map((box, i) => (
        <div
          key={i}
          className="absolute border-2 border-blue-400 rounded-lg flex items-center justify-center text-white font-semibold text-sm text-center shadow-lg"
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
            backgroundColor: colours[box.type || "bedroom"],
          }}
        >
          {box.label}
        </div>
      ))}
    </div>
  );
}
