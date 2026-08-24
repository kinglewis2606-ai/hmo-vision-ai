import { Point, Room } from "./types/floorPlan";

declare global { function noOp(current: string, requested: string): boolean; }
const geometryNoOp = (current: string, requested: string): boolean => String(current || "").trim().toLowerCase() === String(requested || "").trim().toLowerCase();
(globalThis as typeof globalThis & { noOp: typeof geometryNoOp }).noOp = geometryNoOp;

export const BEDROOM_MIN_SQM = 6.51;
export const ENSUITE_SHOWER_MIN_M = 0.8;
export const ENSUITE_TARGET_SQM = 2.5;
const EPSILON = 1e-7;

export function polygonArea(points: Point[] = []): number { if (points.length < 3) return 0; let sum = 0; for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; sum += a.x * b.y - b.x * a.y; } return Math.abs(sum) / 2; }
function orient(a: Point, b: Point, c: Point): number { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function onSegment(p: Point,a: Point,b: Point): boolean { return Math.abs(orient(a,b,p))<=EPSILON && p.x>=Math.min(a.x,b.x)-EPSILON && p.x<=Math.max(a.x,b.x)+EPSILON && p.y>=Math.min(a.y,b.y)-EPSILON && p.y<=Math.max(a.y,b.y)+EPSILON; }
function segmentsIntersect(a: Point,b: Point,c: Point,d: Point): boolean { const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b); if(Math.abs(o1)<=EPSILON&&onSegment(c,a,b))return true; if(Math.abs(o2)<=EPSILON&&onSegment(d,a,b))return true; if(Math.abs(o3)<=EPSILON&&onSegment(a,c,d))return true; if(Math.abs(o4)<=EPSILON&&onSegment(b,c,d))return true; return (o1>0)!==(o2>0)&&(o3>0)!==(o4>0); }
export function polygonSelfIntersects(points: Point[]=[]): boolean { if(points.length<4)return false; for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){if(i===j||(i+1)%points.length===j||(j+1)%points.length===i)continue;if(segmentsIntersect(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))return true;} return false; }
export function pointInPolygon(point: Point,polygon: Point[]=[]): boolean { if(polygon.length<3)return false; let inside=false; for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(onSegment(point,a,b))return true;if((a.y>point.y)!==(b.y>point.y)){const x=((b.x-a.x)*(point.y-a.y))/((b.y-a.y)||1e-12)+a.x;if(point.x<x)inside=!inside;}}return inside; }
export function polygonContainsPolygon(source: Point[],child: Point[]): boolean { return source.length>=3&&child.length>=3&&!polygonSelfIntersects(source)&&!polygonSelfIntersects(child)&&child.every(p=>pointInPolygon(p,source)); }

/** Area of the authoritative source polygon in square metres. approxAreaSqm is the calibration for that polygon only. */
export function sourcePolygonAreaSqm(room: Room): number { const px=polygonArea(room.polygon||[]), calibrated=Number(room.approxAreaSqm); return px>0&&calibrated>0?calibrated:px>0?px/10000:0; }
/** Area of an arbitrary polygon using the source room's calibration. */
export function sqmForPolygon(room: Room,points: Point[]): number { const sourcePx=polygonArea(room.polygon||[]), sourceSqm=sourcePolygonAreaSqm(room); return sourcePx>0&&sourceSqm>0?sourceSqm*polygonArea(points)/sourcePx:0; }
export function roomSourceAreaSqm(room: Room): number { return sourcePolygonAreaSqm(room); }
export function validatePolygon(points?: Point[]): {valid:boolean;areaPx:number;reason?:string} { if(!points||points.length<3)return{valid:false,areaPx:0,reason:"Polygon must contain at least three points."};const areaPx=polygonArea(points);if(!(areaPx>EPSILON))return{valid:false,areaPx,reason:"Polygon area must be positive."};if(polygonSelfIntersects(points))return{valid:false,areaPx,reason:"Polygon self-intersects."};return{valid:true,areaPx}; }
export function validateBedroomGeometry(room: Room): {valid:boolean;areaSqm:number;reason?:string} { const polygon=validatePolygon(room.polygon);if(!polygon.valid)return{valid:false,areaSqm:0,reason:polygon.reason};const areaSqm=sqmForPolygon(room,room.polygon!);if(areaSqm+1e-6<BEDROOM_MIN_SQM)return{valid:false,areaSqm,reason:`Bedroom usable area is ${areaSqm.toFixed(2)} sqm; minimum is ${BEDROOM_MIN_SQM.toFixed(2)} sqm.`};if(!(room.windows||[]).length)return{valid:false,areaSqm,reason:"Bedroom has no preserved external/openable window wall."};if(!(room.doors||[]).length)return{valid:false,areaSqm,reason:"Bedroom has no preserved usable access door."};return{valid:true,areaSqm}; }
/** Exact conservation is measured in source-polygon pixels. Gross floor area is deliberately NOT used here. */
export function areasConserve(source: Room,remainder: Point[],child: Point[],tolerance=1e-6): boolean { const sourcePx=polygonArea(source.polygon||[]),total=polygonArea(remainder)+polygonArea(child);return sourcePx>0&&total>0&&Math.abs(total-sourcePx)/sourcePx<=tolerance; }
export function areaDifferenceSqm(source: Room,remainder: Point[],child: Point[]): number { return Math.abs(sourcePolygonAreaSqm(source)-sqmForPolygon(source,remainder)-sqmForPolygon(source,child)); }
