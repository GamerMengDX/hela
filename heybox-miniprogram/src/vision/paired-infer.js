// The unchanged recognition pipeline requests 0/180 or 90/270 for the same
// region. Compute each pair together; return results in its original order.
// Keep only pending decoded detections (never model sessions or photo pixels).
export function createPairedInfer(runPair){
  const pending=new Map();
  return async(region,angle,kind)=>{
    if(![0,90,180,270].includes(angle)||!['main','aux'].includes(kind))throw new Error('Invalid inference request');
    const box=[region.x,region.y,region.width,region.height];
    if(!box.every(Number.isFinite)||region.width<=0||region.height<=0)throw new Error('Invalid inference region');
    const key=(a)=>JSON.stringify([kind,...box,a]),own=key(angle);
    if(pending.has(own)){const result=pending.get(own);pending.delete(own);return result;}
    const partner=(angle+180)%360;
    const results=await runPair({...region},[angle,partner],kind);
    if(!Array.isArray(results)||results.length!==2)throw new Error('Invalid paired inference result');
    // The pipeline is sequential. At most 180 and 270 can be awaiting use.
    if(pending.size>=2)pending.delete(pending.keys().next().value);
    pending.set(key(partner),results[1]);return results[0];
  };
}
