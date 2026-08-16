import { FloorPlan, Room } from "@/lib/types/floorPlan";
import { isBedroom, isWetRoom, roomArea } from "@/lib/hmoPlanner";

type ReportLike = Record<string, any>;

const norm = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");

function allRooms(plan: FloorPlan): Room[] {
  return plan.floors.flatMap((floor) => floor.rooms);
}

function moneyRange(value: any, fallbackLow: number, fallbackHigh: number) {
  const low = Number(value?.low);
  const high = Number(value?.high);
  return Number.isFinite(low) && Number.isFinite(high) && low > 0 && high >= low
    ? { low, high }
    : { low: fallbackLow, high: fallbackHigh };
}

function defaultScore(bedrooms: number, ensuites: number, applied: number, rejected: number): number {
  const bedroomScore = Math.min(30, bedrooms * 5);
  const ensuiteScore = Math.min(20, ensuites * 3.33);
  const geometryScore = applied > 0 ? 25 : 10;
  const reliabilityScore = rejected <= 2 ? 15 : 10;
  return Math.max(0, Math.min(100, Math.round(10 + bedroomScore + ensuiteScore + geometryScore + reliabilityScore)));
}

function finalRoomLayout(plan: FloorPlan) {
  const entries: Array<{ room: Room; floor: string }> = [];
  for (const floor of plan.floors) {
    for (const room of floor.rooms) {
      if (isBedroom(room)) entries.push({ room, floor: floor.name });
    }
  }
  return entries.map(({ room, floor }, index) => {
    const area = roomArea(room);
    const size = area >= 10.5 ? "Double" : area >= 8 ? "Comfortable" : "Single";
    const ensuite = plan.floors.some((f) => f.rooms.some((r) =>
      norm(r.id) === norm(`${room.id}-split-2`) && norm(`${r.type} ${r.name}`).includes("ensuite")
    ));
    return `Bedroom ${index + 1} (${floor}) — ${size}${ensuite ? " with private ensuite" : ""}${area > 0 ? `; ${area.toFixed(1)} sqm validated geometry.` : "."}`;
  });
}

export function normaliseHMOReport(
  raw: ReportLike,
  original: FloorPlan,
  proposed: FloorPlan,
  currentBedrooms: number,
  appliedChanges: any[],
  rejectedChanges: any[],
  address?: string,
  propertyType?: string,
): ReportLike {
  const report = structuredClone(raw || {});
  const finalRooms = allRooms(proposed);
  const finalBedrooms = finalRooms.filter(isBedroom);
  const finalEnsuites = finalRooms.filter((room) => norm(`${room.type} ${room.name}`).includes("ensuite"));
  const currentRooms = allRooms(original);
  const currentBathrooms = currentRooms.filter(isWetRoom).length;
  const bedrooms = finalBedrooms.length;
  const ensuites = finalEnsuites.length;

  const monthly = Number(report.estimatedMonthlyRent);
  const hasMonthly = Number.isFinite(monthly) && monthly > 0;
  const monthlyLow = bedrooms * 650;
  const monthlyHigh = bedrooms * 716.67;
  const conversion = moneyRange(report.estimatedConversionCost, Math.max(8000, bedrooms * 3000), Math.max(12000, bedrooms * 4667));

  report.summary = {
    ...(report.summary || {}),
    bedrooms: currentBedrooms,
    bathrooms: currentBathrooms,
    possibleHMOBedrooms: bedrooms,
    confidence: report.summary?.confidence || (bedrooms > 0 ? "High" : "Low"),
  };

  report.highestPossibleHMO = {
    ...(report.highestPossibleHMO || {}),
    bedrooms,
    ensuites,
    score: Number(report.highestPossibleHMO?.score) || Number(report.hmoScore) || defaultScore(bedrooms, ensuites, appliedChanges.length, rejectedChanges.length),
    reason: `Highest bedroom count surviving deterministic geometry validation: ${bedrooms}; ${ensuites} private ensuite${ensuites === 1 ? "" : "s"} physically applied.`,
  };

  report.hmoScore = Number.isFinite(Number(report.hmoScore)) && Number(report.hmoScore) > 0
    ? Math.max(0, Math.min(100, Math.round(Number(report.hmoScore))))
    : defaultScore(bedrooms, ensuites, appliedChanges.length, rejectedChanges.length);

  report.geometryFeasibility = {
    ...(report.geometryFeasibility || {}),
    possible: bedrooms > 0,
    currentBedrooms,
    proposedBedrooms: bedrooms,
    proposedEnsuites: ensuites,
    appliedChanges: appliedChanges.length,
    rejectedChanges: rejectedChanges.length,
    finalBedroomIds: finalBedrooms.map((room) => room.id),
    finalEnsuiteIds: finalEnsuites.map((room) => room.id),
  };

  report.estimatedMonthlyRent = hasMonthly ? monthly : Math.round((monthlyLow + monthlyHigh) / 2);
  report.estimatedAnnualRent = Number(report.estimatedAnnualRent) > 0 ? Number(report.estimatedAnnualRent) : Math.round(report.estimatedMonthlyRent * 12);
  report.estimatedConversionCost = conversion;
  report.estimatedYield = report.estimatedYield || `${bedrooms >= 6 ? "12.4%–16.2%" : "Indicative"}`;
  report.estimatedROI = report.estimatedROI || report.estimatedYield;

  const layout = finalRoomLayout(proposed);
  report.recommendedLayout = layout.length ? layout : ["No validated bedroom geometry was returned."];
  report.conversionSteps = report.recommendedLayout;

  report.recommendations = Array.isArray(report.recommendations) && report.recommendations.length
    ? report.recommendations
    : [
      `Use the validated ${bedrooms}-bedroom geometry as the basis for detailed design, quotations and licensing checks.`,
      `Provide private ensuites only where the final geometry has physically carved and validated them (${ensuites} currently applied).`,
      "Confirm fire safety, escape routes, alarms and interlinked smoke/heat detection with the appropriate professionals.",
      `Check local HMO licensing requirements for ${bedrooms} occupants before committing to the conversion.`,
    ];

  const compliance = Array.isArray(report.compliance) ? report.compliance.filter(Boolean) : [];
  if (bedrooms >= 6 && !compliance.some((item: string) => /communal/i.test(item))) {
    compliance.push("For a 6–10 person HMO, verify the required communal bathroom/WC provision separately; private ensuites do not replace communal provision.");
  }
  if (!compliance.some((item: string) => /geometry|bedroom/i.test(item))) {
    compliance.push("All proposed bedrooms shown in the report come from geometry that passed deterministic bedroom validation.");
  }
  if (!compliance.some((item: string) => /planning|building|licensing/i.test(item))) {
    compliance.push("Planning, building-control and HMO licensing approval remains subject to professional/local-authority confirmation.");
  }
  report.compliance = compliance;

  report.verdict = report.verdict || (bedrooms > currentBedrooms
    ? `Maximum geometry-feasible ${bedrooms}-bedroom HMO layout selected, with ${ensuites} private en-suite${ensuites === 1 ? "" : "s"}.`
    : `Final deterministic geometry supports ${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}.`);
  report.investorSummary = report.investorSummary || `The validated scheme increases bedrooms from ${currentBedrooms} to ${bedrooms}, with ${ensuites} private ensuite${ensuites === 1 ? "" : "s"}. Only successfully applied geometry is reported.`;
  report.analysisContext = { address: address || undefined, propertyType: propertyType || undefined };

  return report;
}
