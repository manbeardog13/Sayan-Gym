const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('js/member-ui.js', 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function context(extra = {}) {
  const ctx = vm.createContext({ L: (hr, en) => en, LANG: 'en', esc, t: s => s,
    state: { session: null }, PHOTOS: ['hero', 'log', 'squat', 'checkin'].map(n => ({src:`assets/${n}.webp`,en:n})),
    nameOf: p => p.name_en, ICO: { globe:'<svg/>',plus:'<svg/>',user:'<svg/>',scan:'<svg/>',out:'<svg/>',bulb:'<svg/>' },
    location: { hash:'#/site' }, ...extra });
  vm.runInContext(source, ctx); return ctx;
}

function dataContext(member) {
  const calls = [];
  const sb = { from(table) {
    const query = { select(){ return this; }, eq(...args){ calls.push([table,'eq',...args]); return this; },
      contains(...args){ calls.push([table,'contains',...args]); return this; }, order(){return this;}, limit(){return this;},
      then(resolve){ return Promise.resolve({data:table === 'membership_plans' ? [
        {is_published:true,name_en:'Monthly',price_eur:45}, {is_published:false,name_en:'Draft'}, {name_en:'Unknown'}
      ] : [{title:'Gym update',caption:'Published member news',images:['photo.webp']}]}).then(resolve); } };
    return query;
  }, storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:`https://example.test/${path}`}})})}};
  return {ctx:context({sb,state:{session:member ? {user:{id:'fixture'}} : null}}),calls};
}
test('public strip preserves all four real photos and excludes unpublished plans', async () => {
  const {ctx,calls} = dataContext(false); const items = await ctx.loadStreamItems();
  assert.equal(items.length,5); assert.equal(items[4].label,'Monthly');
  assert.deepEqual(Array.from(items.slice(0,4),x=>x.src),['hero','log','squat','checkin'].map(n=>`assets/${n}.webp`));
  assert.ok(!calls.some(c=>c[0]==='posts'));
});
test('member posts require published status and the members channel, including for staff', async () => {
  const {ctx,calls} = dataContext(true); const items = await ctx.loadStreamItems();
  assert.equal(items.at(-1).kind,'post');
  assert.ok(calls.some(c=>c[0]==='posts' && c[1]==='eq' && c[2]==='status' && c[3]==='published'));
  assert.ok(calls.some(c=>c[0]==='posts' && c[1]==='contains' && c[2]==='channels' && c[3][0]==='members'));
});
test('strip escapes post and plan content, including its detail payload', () => {
  const html = context().stream([{kind:'post',label:'<script>x</script>',detail:'"><img onerror="x">'}]);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img onerror='));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('data-item="{&quot;'));
});

function dockContext(role) {
  let dock;
  const document = {querySelector:()=>null,documentElement:{classList:{remove(){}}},
    createElement:()=>({setAttribute(){},addEventListener(){}}), addEventListener(){},removeEventListener(){},
    body:{appendChild(el){dock=el;}}};
  return {ctx:context({document,state:{session:role ? {} : null},isStaff:()=>['admin','coach'].includes(role),isAdmin:()=>role==='admin'}),get:()=>dock};
}
for (const role of [null,'member','coach','admin']) test(`dock access matches ${role || 'guest'} role`, () => {
  const {ctx,get}=dockContext(role); ctx.renderDock('#/site'); const html=get().innerHTML;
  for (const group of ['gym','train','me']) assert.ok(html.includes(`id="dock-${group}"`));
  assert.equal(html.includes('id="dock-staff"'),['coach','admin'].includes(role));
  assert.equal(html.includes('#/admin'),role==='admin');
  assert.equal(html.includes('#/studio?tab=idea'),role==='admin');
  if (!role) assert.ok(!html.includes('href="#/log"'));
});

function motionHarness(reduced = false) {
  const events = {}, callbacks = new Map(); let id=0, now=0, capture=false, disconnected=false;
  const media={matches:reduced,addEventListener(){},removeEventListener(){}};
  const original={getBoundingClientRect:()=>({width:900}),cloneNode:()=>({dataset:{},setAttribute(){},querySelectorAll:()=>[]})};
  const track={style:{},querySelector:()=>original,querySelectorAll:()=>[],appendChild(){}};
  const pause={setAttribute(){}};
  const viewport={clientWidth:390,querySelector:()=>track,closest:()=>({querySelector:()=>pause}),addEventListener:(n,f)=>events[n]=f,
    setPointerCapture:()=>{capture=true;},hasPointerCapture:()=>capture,releasePointerCapture:()=>{capture=false;},contains:()=>false};
  const ctx=context({document:{querySelector:()=>viewport,hidden:false},matchMedia:()=>media,
    performance:{now:()=>now},requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},cancelAnimationFrame:i=>callbacks.delete(i),
    ResizeObserver:class {observe(){} disconnect(){disconnected=true;}}});
  ctx.wireStream();
  const frame = () => { now+=16; const list=[...callbacks.values()]; callbacks.clear(); list.forEach(f=>f(now)); };
  const x = () => -Number(track.style.transform.match(/translate3d\(([-.\d]+)/)[1]) || 0;
  const fire = (name,props={}) => events[name]({button:0,pointerId:1,clientX:200,clientY:100,...props});
  return {ctx,frame,x,fire,media,pause,callbacks,get disconnected(){return disconnected;}};
}
test('automatic strip moves right to left and wraps without hitting an edge', () => {
  const h=motionHarness(); h.frame(); const before=h.x(); h.frame(); assert.ok(h.x()>before);
  for(let i=0;i<2200;i++)h.frame(); assert.ok(h.x()>=0 && h.x()<900);
});
test('swipe takes over both ways with easing; release resumes leftward on the next frame', () => {
  const h=motionHarness(); h.frame(); h.fire('pointerdown'); h.fire('pointermove',{clientX:140});
  const before=h.x(); h.frame(); assert.ok(h.x()>before && h.x()<before+60);
  h.fire('pointerup'); const release=h.x(); h.frame(); assert.ok(h.x()>release);
  h.fire('pointerdown'); h.fire('pointermove',{clientX:215}); const left=h.x(); h.frame(); assert.ok(h.x()<left);
  h.fire('pointerup'); const right=h.x(); h.frame(); assert.ok(h.x()>right);
});
test('loop resumes when finger movement stops, even before finger lifts', () => {
  const h=motionHarness(); h.frame(); h.fire('pointerdown'); h.fire('pointermove',{clientX:160});
  for(let i=0;i<6;i++)h.frame(); const before=h.x(); h.frame(); assert.ok(Math.abs(h.x()-before-.448)<.001);
});
test('vertical gestures keep native page scrolling; cancellation resumes the loop', () => {
  const h=motionHarness(); h.frame(); h.fire('pointerdown'); h.fire('pointermove',{clientY:130});
  const before=h.x();h.frame();assert.ok(Math.abs(h.x()-before-.448)<.001);
  h.fire('pointerdown');h.fire('pointermove',{clientX:140});h.frame();h.fire('pointercancel');
  const after=h.x();h.frame();assert.ok(h.x()>after);
});
test('reduced motion disables autoplay but preserves manual swipe and arrow navigation', () => {
  const h=motionHarness(true);h.frame();h.frame();assert.equal(h.x(),0);assert.equal(h.pause.hidden,true);
  h.fire('pointerdown');h.fire('pointermove',{clientX:150});h.frame();assert.equal(h.x(),50);
  h.fire('pointerup');h.frame();assert.equal(h.x(),50);
  h.fire('keydown',{key:'ArrowRight',preventDefault(){}});assert.equal(h.x(),290);
});
test('pause remains paused after a swipe and cleanup cancels the animation', () => {
  const h=motionHarness();h.frame();h.pause.onclick();const before=h.x();h.frame();assert.equal(h.x(),before);
  h.fire('pointerdown');h.fire('pointermove',{clientX:150});h.frame();h.fire('pointerup');
  const after=h.x();h.frame();assert.equal(h.x(),after);
  h.ctx.wireStream.cleanup();assert.equal(h.callbacks.size,0);assert.equal(h.disconnected,true);
});

test('splash waits for the last frame and lands the same paused video at stable card bounds', async () => {
  const events={}, order=[];let playbackResolve;
  const video={currentTime:0,style:{},addEventListener:(n,f)=>events[n]=f,pause:()=>order.push('pause'),play:()=>Promise.resolve(),
    getBoundingClientRect:()=>({left:0,top:0,width:390,height:844}),
    animate:frames=>{order.push('animate');assert.equal(frames[1].width,'310px');return {finished:new Promise(r=>playbackResolve=r)};},
    removeAttribute(){},remove(){}};
  const rise={hidden:true,isConnected:true,closest:()=>({classList:{add:()=>order.push('freeze')}}),
    getBoundingClientRect:()=>{order.push('measure');return {left:40,top:80,width:310,height:196};},appendChild:el=>{assert.equal(el,video);order.push('land');}};
  const splash={querySelector:()=>video,appendChild(){},classList:{add(){}},remove:()=>order.push('remove')};
  const ctx=context({document:{getElementById:id=>id==='splash'?splash:rise,createElement:()=>({}),documentElement:{classList:{add(){},remove(){}}},body:{appendChild:el=>assert.equal(el,video)}},
    matchMedia:()=>({matches:false}),sessionStorage:{getItem:()=>null,setItem(){}},setInterval:()=>1,clearInterval(){},performance:{now:()=>0}});
  await ctx.startSplash(async()=>{});assert.ok(!order.includes('animate'));
  const settled=events.ended();await Promise.resolve();assert.ok(order.indexOf('freeze')<order.indexOf('measure'));
  playbackResolve();await settled;assert.deepEqual(order,['pause','freeze','measure','animate','land','remove']);
});
