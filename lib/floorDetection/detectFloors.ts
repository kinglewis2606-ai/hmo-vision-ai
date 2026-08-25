import fs from "fs";
import sharp from "sharp";
import { openai, parseAIJson } from "@/lib/openai";
import { DetectedFloor, DetectedRoom, Point } from "@/lib/types/floorPlan";

type VisionRoom = { floorIndex?: number; x?: number; y?: number; width?: number; height?: number; polygon?: Point[]; name?: string; type?: string; confidence?: string; areaSqm?: number; widthM?: number; depthM?: number };
type VisionChange = { roomIndex?: number; action?: string; newName?: string; newType?: string; reason?: string; split?: { firstName?: string; firstType?: string; secondName?: string; secondType?: string; direction?: string; firstRatio?: number } };
type VisionPlan = { floors?: Array<{ name?: string; x?: number; y?: number; width?: number; height?: number }>; rooms?: VisionRoom[]; changes?: VisionChange[]; strategy?: Record<string, unknown> };
type DetectionContext = { address?: string; propertyType?: string };
let cacheKey = "";
let cache: VisionPlan | null = null;

function boxPolygon(r: VisionRoom): Point[] | undefined { const x=Number(r.x),y=Number(r.y),w=Number(r.width),h=Number(r.height); if(![x,y,w,h].every(Number.isFinite)||w<20||h<20)return undefined; return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]; }
function validPolygon(r: VisionRoom): Point[] | undefined { if(Array.isArray(r.polygon)&&r.polygon.length>=3){const p=r.polygon.map(q=>({x:Number(q.x),y:Number(q.y)}));if(p.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)))return p;} return boxPolygon(r); }
function validRoom(r: VisionRoom,w:number,h:number):boolean{const x=Number(r.x),y=Number(r.y),rw=Number(r.width),rh=Number(r.height);return [x,y,rw,rh].every(Number.isFinite)&&rw>=20&&rh>=20&&x>=0&&y>=0&&x+rw<=w+3&&y+rh<=h+3;}
function dedupeRooms(rooms:VisionRoom[]):VisionRoom[]{const result:VisionRoom[]=[];for(const room of rooms){const duplicate=result.some(existing=>existing.floorIndex===room.floorIndex&&Math.abs(Number(existing.x)-Number(room.x))<8&&Math.abs(Number(existing.y)-Number(room.y))<8&&Math.abs(Number(existing.width)-Number(room.width))<8&&Math.abs(Number(existing.height)-Number(room.height))<8);if(!duplicate)result.push(room);}return result;}

// Floor detection is deterministic. The expensive vision call is used only to recognise
// rooms/labels, removing the timeout-prone request to make the model discover the page envelope.
async function detectDrawingEnvelope(filePath:string,width:number,height:number){
  const maxSide=1200; const scale=Math.min(1,maxSide/Math.max(width,height));
  const iw=Math.max(1,Math.round(width*scale)),ih=Math.max(1,Math.round(height*scale));
  const {data,info}=await sharp(filePath).resize({width:iw,height:ih,fit:"inside",withoutEnlargement:true}).greyscale().raw().toBuffer({resolveWithObject:true});
  let minX=iw,minY=ih,maxX=-1,maxY=-1;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++){if(data[y*info.width+x]<245){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
  if(maxX<0)return{x:0,y:0,width,height};
  const pad=Math.max(8,Math.round(18/scale));
  return{x:Math.max(0,Math.floor(minX/scale)-pad),y:Math.max(0,Math.floor(minY/scale)-pad),width:Math.min(width,Math.ceil((maxX-minX+1)/scale)+pad*2),height:Math.min(height,Math.ceil((maxY-minY+1)/scale)+pad*2)};
}

async function detectPlan(filePath:string,width:number,height:number,context:DetectionContext,floor:{x:number;y:number;width:number;height:number}):Promise<VisionPlan>{
  const maxSide=1200; const scale=Math.min(1,maxSide/Math.max(floor.width,floor.height));
  const left=Math.max(0,Math.round(floor.x)),top=Math.max(0,Math.round(floor.y));
  const cropWidth=Math.min(width-left,Math.max(1,Math.round(floor.width))),cropHeight=Math.min(height-top,Math.max(1,Math.round(floor.height)));
  const iw=Math.max(1,Math.round(cropWidth*scale)),ih=Math.max(1,Math.round(cropHeight*scale));
  const image=await sharp(filePath).extract({left,top,width:cropWidth,height:cropHeight}).resize({width:iw,height:ih,fit:"inside",withoutEnlargement:true}).jpeg({quality:78,mozjpeg:true}).toBuffer();
  const prompt=`Read this architectural floor-plan image for HMO conversion. Detect every enclosed room separated by visible wall lines. Return room bounding boxes and simple polygons in image pixels. Classify rooms from printed labels/layout. Do not invent rooms. Do not explain.

Use the detected rooms to give a concise HMO strategy. Changes must reference roomIndex. The deterministic geometry engine validates every change.

Property type: ${context.propertyType||"Unknown"}
JSON only: {"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0,"polygon":[{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0}],"name":"Bedroom 1","type":"bedroom","confidence":"high"}],"changes":[{"roomIndex":0,"action":"ConvertToBedroom","newName":"Bedroom 1","newType":"bedroom","reason":"Existing room"}],"strategy":{"verdict":"","recommendations":[],"planningRisk":""}}
Allowed actions: ConvertToBedroom, ConvertToKitchen, ConvertToBathroom, ConvertToEnsuite, ExtendBathroom, SplitRoom, MergeRoom. For SplitRoom include split:{firstName,firstType,secondName,secondType,direction,firstRatio}. Return at most 20 rooms and 12 changes.`;
  const response=await openai.responses.create({model:"gpt-4.1-mini",input:[{role:"user",content:[{type:"input_text",text:prompt},{type:"input_image",image_url:`data:image/jpeg;base64,${image.toString("base64")}`,detail:"low"}]}],max_output_tokens:2500});
  const raw=parseAIJson<VisionPlan>(response.output_text||"");
  return {floors:[{name:"Ground Floor",x:0,y:0,width:iw,height:ih}],rooms:raw.rooms||[],changes:raw.changes||[],strategy:raw.strategy||{}};
}

function floorResult(plan:VisionPlan,width:number,height:number):DetectedFloor[]{return(plan.floors||[]).map((f,i)=>({name:String(f.name||`Floor ${i+1}`),level:i,top:Math.max(0,Math.round(Number(f.y||0))),left:Math.max(0,Math.round(Number(f.x||0))),bottom:Math.min(height,Math.round(Number(f.y||0)+Number(f.height||0))),right:Math.min(width,Math.round(Number(f.x||0)+Number(f.width||0)))})).filter(f=>f.bottom-f.top>=40&&(f.right??0)-(f.left??0)>=40);}

export async function detectFloors(filePath:string,context:DetectionContext={}):Promise<DetectedFloor[]>{
  const metadata=await sharp(filePath).metadata();const width=metadata.width??0,height=metadata.height??0;if(!width||!height)return[];
  const stat=fs.statSync(filePath);const key=`${filePath}:${stat.size}:${stat.mtimeMs}:${context.address||""}:${context.propertyType||""}`;if(cacheKey===key&&cache)return floorResult(cache,width,height);
  const envelope=await detectDrawingEnvelope(filePath,width,height);const raw=await detectPlan(filePath,width,height,context,envelope);
  const scale=Math.min(1,1200/Math.max(envelope.width,envelope.height));
  const floors=[{name:"Ground Floor",x:envelope.x,y:envelope.y,width:envelope.width,height:envelope.height}];
  const rooms=dedupeRooms((raw.rooms||[]).map(r=>({...r,floorIndex:0,x:envelope.x+Number(r.x||0)/scale,y:envelope.y+Number(r.y||0)/scale,width:Number(r.width||0)/scale,height:Number(r.height||0)/scale,polygon:validPolygon({...r,x:envelope.x+Number(r.x||0)/scale,y:envelope.y+Number(r.y||0)/scale,width:Number(r.width||0)/scale,height:Number(r.height||0)/scale})})).filter(r=>validRoom(r,width,height)&&!!r.polygon));
  cacheKey=key;cache={...raw,floors,rooms};console.log(`Floor detection complete: deterministic envelope, ${rooms.length} room(s), ${raw.changes?.length||0} strategy change(s)`);return floorResult(cache,width,height);
}

export function getVisionDetectedRooms(filePath:string):DetectedRoom[]|null{if(!cache||!cacheKey.startsWith(`${filePath}:`))return null;const rooms=dedupeRooms(cache.rooms||[]);const perFloorCount=new Map<number,number>();return rooms.map(room=>{const floorIndex=Number(room.floorIndex||0),ordinal=(perFloorCount.get(floorIndex)||0)+1;perFloorCount.set(floorIndex,ordinal);const prefix=String(cache?.floors?.[floorIndex]?.name||`Floor ${floorIndex+1}`).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||`floor-${floorIndex+1}`;return{id:`${prefix}-room-${ordinal}`,x:Number(room.x),y:Number(room.y),width:Number(room.width),height:Number(room.height),polygon:validPolygon(room),...(room.name?{name:String(room.name)}:{}),...(room.type?{type:String(room.type)}:{}),...(room.confidence?{confidence:String(room.confidence)}:{}),...(Number(room.areaSqm)>0?{approxAreaSqm:Number(room.areaSqm)}:{}),...(Number(room.widthM)>0?{approxWidthM:Number(room.widthM)}:{}),...(Number(room.depthM)>0?{approxDepthM:Number(room.depthM)}:{})} as DetectedRoom&Record<string,unknown>;});}
export function getVisionStrategy():{changes:VisionChange[];strategy:Record<string,unknown>}{return{changes:Array.isArray(cache?.changes)?cache!.changes:[],strategy:cache?.strategy||{}};}
