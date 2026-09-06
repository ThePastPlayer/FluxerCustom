import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(new URL('../fluxer_desktop/package.json',import.meta.url));
const {build,transformSync}=require('esbuild');
const {_electron}=createRequire(new URL('./test-tools/package.json',import.meta.url))('playwright-core');
// Exercise the actual application option, not a duplicate test-only fix.
const source=readFileSync('fluxer_app/src/features/voice/engine/v2/VoiceEngineV2AppConnectionHostAdapter.ts','utf8');
const functionSource=source.slice(source.indexOf('function createRoomOptions('),source.indexOf('function createRoomConnectOptions('));
const module={exports:{}};
vm.runInNewContext(transformSync(functionSource+'\nexport {createRoomOptions};',{loader:'ts',format:'cjs'}).code,
 {module,exports:module.exports,createRoomPublishDefaults:()=>({videoCodec:'h264'}),createWebAudioMixOption:()=>false});
const configuredSingle=module.exports.createRoomOptions(null,[]).roomOptions.singlePeerConnection;
assert.equal(configuredSingle,false);
const bundle=await build({entryPoints:['fluxer_app/pkgs/livekit-client/src/index.ts'],bundle:true,write:false,platform:'browser',format:'iife',globalName:'LK'});
const http=createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<html><body>Isolated synthetic codec test</body></html>');});
await new Promise(r=>http.listen(17889,'127.0.0.1',r));
const server=spawn('custom/.tools/livekit-1.12.0/livekit-server.exe',['--config','custom/fixtures/codec-server.yaml'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='';
server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
function token(room,identity){
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const p=enc({alg:'HS256',typ:'JWT'})+'.'+enc({iss:'codec-test',sub:identity,exp:Math.floor(Date.now()/1000)+300,nbf:Math.floor(Date.now()/1000)-10,video:{roomJoin:true,room,canPublish:true,canSubscribe:true,canPublishData:true}});
 return p+'.'+createHmac('sha256','synthetic-local-test-key-not-production').update(p).digest('base64url');
}
let app;
try {
 await delay(1000);
 const env={...process.env,LEPAST_TEST_PROFILE:'smoke'};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:'E:/FluxerCustom/fluxer_desktop/dist-electron/win-unpacked/Fluxer LePast.exe',env,timeout:45000});
 const newWindow=app.waitForEvent('window');
 await app.evaluate(({BrowserWindow})=>{const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});w.loadURL('http://127.0.0.1:17889');});
 const page=await newWindow;await page.waitForURL('http://127.0.0.1:17889/**');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const results=[];
 for(const single of [true,configuredSingle]){
  const room='test-'+single+'-'+Date.now();
  const result=await page.evaluate(async({single,tokens})=>{
   const {Room,RoomEvent,Track}=LK;
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   const rooms=[];const tracks=[];const timers=[];const errors=[];
   const canvas=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');let n=0;timers.push(setInterval(()=>{ctx.fillStyle=n++%2?'red':'blue';ctx.fillRect(0,0,320,180)},33));const t=c.captureStream(30).getVideoTracks()[0];tracks.push(t);return t;};
   try{
    const desktop=new Room({singlePeerConnection:single,publishDefaults:{videoCodec:'h264'}});
    const vp8=new Room({singlePeerConnection:false});
    const h264=new Room({singlePeerConnection:false});
    rooms.push(desktop,vp8,h264);
    desktop.on(RoomEvent.TrackSubscriptionFailed,(sid,e)=>errors.push({sid,error:String(e)}));
    for(let i=0;i<rooms.length;i++)await rooms[i].connect('ws://127.0.0.1:17880',tokens[i],{autoSubscribe:i===0});
    await desktop.localParticipant.publishTrack(canvas(),{videoCodec:'h264',simulcast:false,source:Track.Source.ScreenShare});
    // An existing H264 viewer stream precedes an iOS-style VP8 stream.
    await h264.localParticipant.publishTrack(canvas(),{videoCodec:'h264',simulcast:false,source:Track.Source.ScreenShare});
    await wait(1800);
    await vp8.localParticipant.publishTrack(canvas(),{videoCodec:'vp8',simulcast:true,source:Track.Source.ScreenShare});
    await wait(11000);
    const received=[];
    for(const p of desktop.remoteParticipants.values())for(const pub of p.videoTrackPublications.values()){
     const stats=pub.track ? await pub.track.getRTCStatsReport() : null;
     const inbound=stats ? [...stats.values()].find(s=>s.type==='inbound-rtp'&&s.kind==='video') : null;
     received.push({identity:p.identity,subscribed:pub.isSubscribed,framesReceived:inbound?.framesReceived??0,codec:stats?.get(inbound?.codecId)?.mimeType??null});
    }
    return {single,received,errors};
   }finally{for(const r of rooms)await r.disconnect();tracks.forEach(t=>t.stop());timers.forEach(clearInterval);}
  },{single,tokens:['desktop','ios-vp8','pc-h264'].map(id=>token(room,id))});
  results.push(result);console.log(JSON.stringify(result));
 }
 writeFileSync('custom/reports/codec-interoperability.json',JSON.stringify(results,null,2));
 assert.equal(results[0].received.find(r=>r.identity==='ios-vp8').subscribed,false,'unfixed control reproduces failure on LiveKit 1.12');
 assert.equal(results[1].errors.length,0);
 for(const id of ['ios-vp8','pc-h264']){
  const stream=results[1].received.find(r=>r.identity===id);
  assert.ok(stream.subscribed && stream.framesReceived>100,id+' must receive real frames');
 }
}finally{await app?.close();server.kill();http.close();writeFileSync('custom/reports/codec-server.log',logs);}
