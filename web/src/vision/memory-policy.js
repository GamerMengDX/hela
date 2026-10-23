export const MAX_PHOTO_EDGE=1920;
export function fittedPhotoSize(width,height){
  const scale=Math.min(1,MAX_PHOTO_EDGE/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
