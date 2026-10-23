// Keep a real paint/GC opportunity after releasing every GPU session. Avoid
// forcing another entire display frame for short loading/preparation steps.
export function createInferenceScheduler({now=()=>performance.now(),paint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0))),budgetMs=24}={}){
  let lastPaint=now();
  async function releaseFrame(){await paint();lastPaint=now();}
  async function yieldFrame(){if(now()-lastPaint>=budgetMs)await releaseFrame();}
  return {yieldFrame,releaseFrame};
}
