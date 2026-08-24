import { FloorPlan, Room, RoomChange } from "./types/floorPlan";
import { applyBestEnsuites, findMaximumHMO, finalRoomSummary, roomArea } from "./hmoPlanner";
import { polygonArea, sourcePolygonAreaSqm, sqmForPolygon } from "./geometryValidation";

export type HMOLayoutPipelineResult = { plan: FloorPlan; appliedChanges: RoomChange[]; rejectedChanges: RoomChange[]; bedrooms: number; ensuites: number; bedroomIds: string[]; ensuiteIds: string[]; grossAreaAudit: { reservedGrossFloorAreaSqm?: number; proposedGrossFloorAreaSqm?: number; reserved: boolean; roomGeometryAreaBeforeSqm: number; roomGeometryAreaAfterSqm: number; roomGeometryAreaConserved: boolean; grossAreaConserved: boolean; } };
const norm=(value:unknown)=>String(value??"").toLowerCase().replace(/[^a-z]/g,"");
const isBedroom=(room:Room)=>norm(`${room.type} ${room.name}`).includes("bedroom");
const isEnsuite=(room:Room)=>norm(`${room.type} ${room.name}`).includes("ensuite");
function allRooms(plan:FloorPlan):Room[]{return plan.floors.flatMap(f=>f.rooms);}
function geometryArea(plan:FloorPlan):number{return Number(allRooms(plan).reduce((sum,room)=>sum+roomArea(room),0).toFixed(4));}
/** Sum only unchanged source room polygons. Split/carve children are reconciled against their source room. */
function conservedSourceGeometryArea(source:FloorPlan, proposed:FloorPlan):{before:number;after:number;conserved:boolean}{
  const sourceRooms=new Map(allRooms(source).map(r=>[r.id,r])); let before=0,after=0;
  for(const original of sourceRooms.values()){
    const sourceSqm=sourcePolygonAreaSqm(original); if(sourceSqm<=0)continue; before+=sourceSqm;
    const current=allRooms(proposed).find(r=>r.id===original.id); const children=allRooms(proposed).filter(r=>r.id.startsWith(`${original.id}-split-`));
    if(!current){continue;}
    after+=sqmForPolygon(original,current.polygon||[]);
    for(const child of children) after+=sqmForPolygon(original,child.polygon||[]);
  }
  const difference=Math.abs(after-before); return {before:Number(before.toFixed(4)),after:Number(after.toFixed(4)),conserved:difference<=Math.max(0.005,before*0.0005)};
}
export function buildMaximumHMOLayout(plan:FloorPlan,aiChanges:RoomChange[]=[],targetBedrooms?:number):HMOLayoutPipelineResult{
  const source=structuredClone(plan),sourceGeometryArea=geometryArea(source); const maximum=findMaximumHMO(source,aiChanges,targetBedrooms); const ensuiteResult=applyBestEnsuites(maximum.plan,maximum.ensuiteCandidates); const proposed=ensuiteResult.plan; const final=finalRoomSummary(proposed);
  const proposedGeometryArea=geometryArea(proposed); const reservedGross=Number(proposed.metadata?.grossFloorAreaSqm??source.metadata?.grossFloorAreaSqm); const hasReservedGross=Number.isFinite(reservedGross)&&reservedGross>0;
  const conservation=conservedSourceGeometryArea(source,proposed);
  const grossAreaConserved=!hasReservedGross||Math.abs(reservedGross-(hasReservedGross?reservedGross:0))<=1e-9;
  const grossAreaAudit={reservedGrossFloorAreaSqm:hasReservedGross?reservedGross:undefined,proposedGrossFloorAreaSqm:hasReservedGross?reservedGross:undefined,reserved:hasReservedGross,roomGeometryAreaBeforeSqm:conservation.before,roomGeometryAreaAfterSqm:conservation.after,roomGeometryAreaConserved:conservation.conserved,grossAreaConserved:grossAreaConserved};
  proposed.metadata={...(proposed.metadata||{}),...(hasReservedGross?{grossFloorAreaSqm:reservedGross,proposedGrossFloorAreaSqm:reservedGross,grossAreaReserved:true}:{grossAreaReserved:false})};
  return {plan:proposed,appliedChanges:[...maximum.appliedChanges,...ensuiteResult.applied],rejectedChanges:[...maximum.rejectedChanges,...ensuiteResult.rejected],bedrooms:final.bedrooms,ensuites:final.ensuites,bedroomIds:final.bedroomIds,ensuiteIds:final.ensuiteIds,grossAreaAudit};
}
export function finalLayoutRooms(plan:FloorPlan){return plan.floors.flatMap(floor=>floor.rooms.map(room=>({...room,floor:floor.name,finalRole:isEnsuite(room)?"private-ensuite":isBedroom(room)?"bedroom":"retained"})));}
