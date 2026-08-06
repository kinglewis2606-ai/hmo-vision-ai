"use client";

interface Props {
  image: string;

  originalFloorPlan?: any;

  proposedFloorPlan?: any;
}

export default function FloorPlanOverlay({
    image,
    originalFloorPlan,
    proposedFloorPlan,
}: Props) {
  return (
    <div className="relative w-full">

      <img
        src={image}
        className="w-full rounded-xl border"
        alt="Proposed"
      />
{proposedFloorPlan && (
    <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 1400"
    >
        {proposedFloorPlan.rooms?.map((room:any) => (
            <g key={room.id}>
                <polygon
                    points={room.points}
                    fill="rgba(0,180,255,.20)"
                    stroke="#00B4FF"
                    strokeWidth="3"
                />

                <text
                    x={room.centroid.x}
                    y={room.centroid.y}
                    textAnchor="middle"
                    fill="#00B4FF"
                    fontSize="20"
                >
                    {room.label}
                </text>
            </g>
        ))}
    </svg>
)}
    </div>
  );
}
