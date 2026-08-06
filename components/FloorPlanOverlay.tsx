"use client";

interface Room {
  id: string;
  label: string;
  polygon?: { x: number; y: number }[];
  centroid?: {
    x: number;
    y: number;
  };
}

interface FloorPlan {
  rooms?: Room[];
}

interface Props {
  image: string;
  originalFloorPlan?: FloorPlan;
  proposedFloorPlan?: FloorPlan;
}

export default function FloorPlanOverlay({
  image,
  proposedFloorPlan,
}: Props) {
  return (
    <div className="relative w-full">

      <img
        src={image}
        className="w-full rounded-xl border"
        alt="Floor Plan"
      />

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 1000 1400"
      >

        {proposedFloorPlan?.rooms?.map((room) => {

          if (!room.polygon?.length) return null;

          const points = room.polygon
            .map((p) => `${p.x},${p.y}`)
            .join(" ");

          return (
            <g key={room.id}>

              <polygon
                points={points}
                fill="rgba(0,150,255,.18)"
                stroke="#00A8FF"
                strokeWidth={3}
              />

              {room.centroid && (
                <text
                  x={room.centroid.x}
                  y={room.centroid.y}
                  fill="white"
                  textAnchor="middle"
                  fontSize="18"
                  fontWeight="bold"
                >
                  {room.label}
                </text>
              )}

            </g>
          );

        })}

      </svg>

    </div>
  );
}
