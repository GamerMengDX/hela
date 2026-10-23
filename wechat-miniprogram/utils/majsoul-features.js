// Pure pixel features shared by WeChat and Heybox; no network or image upload.
const W=32,H=48;
const white=(r,g,b)=>Math.min(r,g,b)>180&&Math.max(r,g,b)-Math.min(r,g,b)<65||r>180&&g>115&&b>115&&r>g*1.2&&Math.abs(g-b)<35;
function components(image,{xStart=0,yStart=0,minPixels=80}={}){
  const {width:w,height:h,data}=image,mask=new Uint8Array(w*h),queue=new Int32Array(w*h),result=[];
  for(let y=yStart;y<h;y++)for(let x=xStart;x<w;x++){const p=(y*w+x)*4;if(white(data[p],data[p+1],data[p+2]))mask[y*w+x]=1;}
  for(let p=0;p<mask.length;p++){
    if(!mask[p])continue;let head=0,tail=1,count=0,x0=w,y0=h,x1=0,y1=0;queue[0]=p;mask[p]=0;
    while(head<tail){const n=queue[head++],x=n%w,y=Math.floor(n/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);
      for(const k of [x>0?n-1:-1,x+1<w?n+1:-1,y>0?n-w:-1,y+1<h?n+w:-1])if(k>=0&&mask[k]){mask[k]=0;queue[tail++]=k;}
    }
    if(count>=minPixels)result.push({x:x0,y:y0,width:x1-x0,height:y1-y0,fill:count/((x1-x0)*(y1-y0))});
  }
  return result;
}
function resizeMask(mask,w,h){
  const out=new Float32Array(W*H),sx=w/W,sy=h/H;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const left=x*sx,right=(x+1)*sx,top=y*sy,bottom=(y+1)*sy;let value=0;
    for(let yy=Math.floor(top);yy<Math.ceil(bottom)&&yy<h;yy++)for(let xx=Math.floor(left);xx<Math.ceil(right)&&xx<w;xx++)value+=mask[yy*w+xx]*Math.max(0,Math.min(right,xx+1)-Math.max(left,xx))*Math.max(0,Math.min(bottom,yy+1)-Math.max(top,yy));
    out[y*W+x]=value/(sx*sy);
  }
  return out;
}
function descriptors(image,box,angle=0){
  const x0=Math.max(0,Math.round(box.x)),y0=Math.max(0,Math.round(box.y)),bw=Math.min(image.width-x0,Math.round(box.width)),bh=Math.min(image.height-y0,Math.round(box.height));
  const turned=angle===90||angle===270,w=turned?bh:bw,h=turned?bw:bh,mask=new Uint8Array(w*h),red=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const xx=angle===90?y:angle===180?bw-1-x:angle===270?bw-1-y:x,yy=angle===90?bh-1-x:angle===180?bh-1-y:angle===270?x:y,p=((y0+yy)*image.width+x0+xx)*4,r=image.data[p],g=image.data[p+1],b=image.data[p+2];
    mask[y*w+x]=r*299+g*587+b*114<170000?1:0;red[y*w+x]=r>g*1.5&&r>b*1.5?1:0;
  }
  const body=resizeMask(mask,w,h),mx=Math.max(1,Math.round(w*.02)),my=Math.max(1,Math.round(h*.02)),gw=Math.max(1,w-2*mx),gh=Math.max(1,h-2*my),glyph=new Uint8Array(gw*gh),colors=new Uint8Array(gw*gh);
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){glyph[y*gw+x]=mask[(y+my)*w+x+mx];colors[y*gw+x]=red[(y+my)*w+x+mx];}
  const queue=new Int32Array(gw*gh);let head=0,tail=0;
  const add=n=>{if(glyph[n]){glyph[n]=0;queue[tail++]=n;}};
  for(let y=0;y<gh;y++){add(y*gw);add(y*gw+gw-1);}for(let x=0;x<gw;x++){add(x);add((gh-1)*gw+x);}
  while(head<tail){const n=queue[head++],x=n%gw,y=Math.floor(n/gw);if(x)add(n-1);if(x+1<gw)add(n+1);if(y)add(n-gw);if(y+1<gh)add(n+gw);}
  let left=gw,right=0,top=gh,bottom=0,count=0,redCount=0;
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++)if(glyph[y*gw+x]){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);count++;redCount+=colors[y*gw+x];}
  let normalized=new Float32Array(W*H);
  if(count>=5){const cropped=new Uint8Array((right-left)*(bottom-top));for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)cropped[(y-top)*(right-left)+x-left]=glyph[y*gw+x];normalized=resizeMask(cropped,right-left,bottom-top);}
  return {body,glyph:normalized,red:count?redCount/count:0};
}
module.exports={W,H,white,components,descriptors};
