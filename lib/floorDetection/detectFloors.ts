import fs from "fs";
import sharp from "sharp";
import { openai } from "@/lib/openai";
import { DetectedFloor, DetectedRoom } from "@/lib/types/floorPlan";

type P={floors?:Array<{name?:string;x?:number;y?:number;width?:number;height?:number}>;rooms?:Array<{floorIndex?:number;x?:number;y?:number;width?:number;height?:number}>};
let cachePath="",cache:P|null=null;
const clean=(s:string)=>s.replace(/^```json\s*/i,"").replace(/\s*```$/i,"").trim();
async function vision(path:string):Promise<P|null>{
 const src=fs.readFileSync(path),m=await sharp(src).metadata(),w=m.width??0,h=m.height??0;if(!w||!h)return null;
 const img=await sharp(src).jpeg({quality:90}).toBuffer();
 const r=await openai.responses.create({model:"gpt-5",input:[{role:"user",content:[
  {type:"input_text",text:`Read this floor plan as a geometry detector. Do not assume 3 floors, equal thirds, orientation, or a room count. Find every distinct floor-plan panel and every enclosed room. Return JSON only: {"floors":[{"name":"","x":0,"y":0,"width":0,"height":0}],"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0}]}. Coordinates are pixels for this ${w}x${h} image. Include bedrooms, living/lounge, dining, kitchen, bathrooms, shower rooms, WC, hall, landing, stairs, utility/storage and every other enclosed room. Do not invent, merge or split rooms.`},
  {type:"input_image",image_url:`data:image/jpeg;base64,${img.toString("base64")}`,detail:"high"}
 ]} ]});
 try{return JSON.parse(clean(r.output_text||"")) as P}catch{return null}
}
export async function detectFloors(path:string):Promise<DetectedFloor[]>{
 const m=await sharp(path).metadata(),w=m.width??0,h=m.height??0;if(!w||!h)return [];
 if(cachePath===path&&cache)return cache.floors?.map((f,i)=>({name:f.name||`Floor ${i+1}`,level:i,top:Math.max(0,Math.round(f.y||0)),left:Math.max(0,Math.round(f.x||0)),bottom:Math.min(h,Math.round((f.y||0)+(f.height||0))),right:Math.min(w,Math.round((f.x||0)+(f.width||0)))}))||[];
 try{const p=await vision(path);if(p?.floors?.length&&p.rooms?.length>=2){cachePath=path;cache=p;const floors=p.floors.filter(f=>Number(f.width)>100&&Number(f.height)>100);return floors.map((f,i)=>({name:f.name||`Floor ${i+1}`,level:i,top:Math.max(0,Math.round(f.y||0)),left:Math.max(0,Math.round(f.x||0)),bottom:Math.min(h,Math.round((f.y||0)+(f.height||0))),right:Math.min(w,Math.round((f.x||0)+(f.width||0)))}));}}catch(e){console.warn("Vision floor detection failed; using one-floor fallback",e)}
 cachePath=path;cache=null;return [{name:"Floor Plan",level:0,top:0,bottom:h,left:0,right:w}];
}
export function getVisionDetectedRooms(path:string):DetectedRoom[]|null{if(cachePath!==path||!cache?.rooms?.length)return null;return cache.rooms.map((r,i)=>({id:`room-${i+1}`,x:Math.round(r.x||0),y:Math.round(r.y||0),width:Math.round(r.width||0),height:Math.round(r.height||0)})).filter(r=>r.width>=20&&r.height>=20);}
