const data = await res.json();
"use client";

import FloorPlanOverlay, { type Box } from "@/components/FloorPlanOverlay";
import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [filename, setFilename] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
const [boxes, setBoxes] = useState<Box[]>([]);
  
  async function analyseFloorPlan() {
    if (!filename) {
      alert("Please upload a floor plan first.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename,
          address,
          propertyType,
        }),
      });

      const data = await res.json();

if (!data.success) {
  alert(data.error || "Analysis failed");
  return;
}

const parsedReport =
  typeof data.result === "string"
    ? JSON.parse(
        data.result
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "")
      )
    : data.result;

setReport(parsedReport);
