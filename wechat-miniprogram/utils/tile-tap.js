// Keep the tile in place while distinguishing a single tap from a double tap.
// Object identity preserves the intended tile if another deletion shifts indices.
const DOUBLE_TAP_MS=280;
function createTileTap({remove,edit,schedule=setTimeout,cancel=clearTimeout}){
  let pending=[],last=null,timer;
  function stop(){if(timer!==undefined)cancel(timer);pending=[];last=null;timer=undefined;}
  function flush(){const items=pending.slice();stop();for(const item of items)remove(item);}
  return {
    tap(target){
      if(!target)return;
      if(last===target){const others=pending.filter(item=>item!==target);stop();for(const item of others)remove(item);edit(target);return;}
      // Wait for the whole tap sequence to settle so an earlier deletion does
      // not move a different tile from under the second tap of a double tap.
      if(timer!==undefined)cancel(timer);
      if(!pending.includes(target))pending.push(target);
      last=target;timer=schedule(flush,DOUBLE_TAP_MS);
    },
    cancel:stop,flush
  };
}
module.exports={DOUBLE_TAP_MS,createTileTap};
