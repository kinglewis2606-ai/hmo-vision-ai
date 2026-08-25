import { FloorPlan, Room, RoomChange } from "./types/floorPlan";
import { applyBestEnsuites, findMaximumHMO, finalRoomSummary, roomArea } from "./hmoPlanner";
import { polygonArea, sourcePolygonAreaSqm, sqmForPolygon, validateBedroomGeometry } from "./geometryValidation";

export type HMOLayoutPipelineResult = { plan: FloorPlan; appliedChanges: RoomChange[]; rejectedChanges: RoomChange[]; bedrooms: number; ensuites: number; bedroomIds: string[]; ensuiteIds: string[]; grossAreaAudit: { reservedGrossFloorAreaSqm?: number; proposedGrossFloorAreaSqm?: number; reserved: boolean; roomGeometryAreaBeforeSqm: number; roomGeometryAreaAfterSqm: number; roomGeometryAreaConserved: boolean; grossAreaConserved: boolean } };
const norm=(value:unknown)=>String(value??"").toLowerCase().replace(/[^a-z]/g,"");
const isBedroomLabel=(room:Room)=>norm(`${room.type} ${room.name}`).includes("bedroom");
const isEnsuite=(room:Room)=>norm(`${room.type} ${room.name}`).includes("ensuite");
function allRooms(plan:FloorPlan):Room[]{return plan.floors.flatMap(f=>f.rooms);}
function geometryArea(plan:FloorPlan):number{return Number(allRooms(plan).reduce((sum,room)=>sum+roomArea(room),0).toFixed(4));}
function stripInvalidBedroomLabels(plan:FloorPlan):FloorPlan{
  const updated=structuredClone(plan);
  for(const room of allRooms(updated)){
    if(!isBedroomLabel(room)) continue;
    if(validateBedroomGeometry(room).valid) continue;
    room.type="retained";
    room.name=String(room.name||"Existing Room").replace(/\bbedroom\b/gi,"Existing Room").replace(/\s+/g," ").trim() || "Existing Room";
    room.notes=[room.notes,"Excluded from final HMO bedroom count because deterministic geometry is below the 6.51 sqm minimum or lacks required openings."].filter(Boolean).join("; ");
  }
  return updated;
}
function conservedSourceGeometryArea(source:FloorPlan, proposed:FloorPlan){
  const sourceRooms=new Map(allRooms(source).map(r=>[r.id,r])); let before=0,after=0;
  for(const original of sourceRooms.values()){
    const sourceSqm=sourcePolygonAreaSqm(original); if(sourceSqm<=0)continue; before+=sourceSqm;
    const current=allRooms(proposed).find(r=>r.id===original.id); const children=allRooms(proposed).filter(r=>r.id.startsWith(`${original.id}-split-`));
    if(!current)continue;
    after+=sqmForPolygon(original,current.polygon||[]);
    for(const child of children) after+=sqmForPolygon(original,child.polygon||[]);
  }
  const difference=Math.abs(after-before);
  return {before:Number(before.toFixed(4)),after:Number(after.toFixed(4)),conserved:difference<=Math.max(0.005,before*0.0005)};
}
export function buildMaximumHMOLayout(plan:FloorPlan,aiChanges:RoomChange[]=[],targetBedrooms?:number):HMOLayoutPipelineResult{
  const source=structuredClone(plan);
  const maximum=findMaximumHMO(source,aiChanges,targetBedrooms);
  const cleanedMaximum=stripInvalidBedroomLabels(maximum.plan);
  const ensuiteResult=applyBestEnsuites(cleanedMaximum,maximum.ensuiteCandidates);
  const proposed=stripInvalidBedroomLabels(ensuiteResult.plan);
  const final=finalRoomSummary(proposed);
  const reservedGross=Number(proposed.metadata?.grossFloorAreaSqm??source.metadata?.grossFloorAreaSqm);
  const hasReservedGross=Number.isFinite(reservedGross)&&reservedGross>0;
  const conservation=conservedSourceGeometryArea(source,proposed);
  const grossAreaAudit={reservedGrossFloorAreaSqm:hasReservedGross?reservedGross:undefined,proposedGrossFloorAreaSqm:hasReservedGross?reservedGross:undefined,reserved:hasReservedGross,roomGeometryAreaBeforeSqm:conservation.before,roomGeometryAreaAfterSqm:conservation.after,roomGeometryAreaConserved:conservation.conserved,grossAreaConserved:conservation.conserved};
  proposed.metadata={...(proposed.metadata||{}),...(hasReservedGross?{grossFloorAreaSqm:reservedGross,proposedGrossFloorAreaSqm:reservedGross,grossAreaReserved:true}:{grossAreaReserved:false})};
  return {plan:proposed,appliedChanges:[...maximum.appliedChanges,...ensuiteResult.applied],rejectedChanges:[...maximum.rejectedChanges,...ensuiteResult.rejected],bedrooms:final.bedrooms,ensuites:final.ensuites,bedroomIds:final.bedroomIds,ensuiteIds:final.ensuiteIds,grossAreaAudit};
}
export function finalLayoutRooms(plan:FloorPlan){return plan.floors.flatMap(floor=>floor.rooms.map(room=>({...room,floor:floor.name,finalRole:isEnsuite(room)?"private-ensuite":norm(`${room.type} ${room.name}`).includes("bedroom")?"bedroom":"retained"})));}
