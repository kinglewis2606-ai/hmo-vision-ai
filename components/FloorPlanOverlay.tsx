"use client";

interface Props {
  image: string;
}

export default function FloorPlanOverlay({ image }: Props) {
  return (
    <div className="relative w-full">

      <img
        src={image}
        className="w-full rounded-xl border"
        alt="Proposed"
      />

      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 1400"
      >

        <rect
          x="110"
          y="620"
          width="210"
          height="170"
          fill="rgba(0,180,255,.25)"
          stroke="#00B4FF"
          strokeWidth="4"
        />

        <text
          x="215"
          y="710"
          fill="#00B4FF"
          fontSize="26"
          textAnchor="middle"
          fontWeight="bold"
        >
          Bedroom 5
        </text>

      </svg>

    </div>
  );
}
