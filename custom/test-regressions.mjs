// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';
const require=createRequire(new URL('../fluxer_desktop/package.json',import.meta.url));
const esbuild=require('esbuild');
const read=p=>readFileSync(new URL('../fluxer_app/src/'+p,import.meta.url),'utf8');
function load(p,globals={},extra='') {
 const module={exports:{}};
 vm.runInNewContext(esbuild.transformSync(read(p)+extra,{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,URL,URLSearchParams,FormData,Blob,ArrayBuffer,Error,DOMException,Uint8Array,Set,Map,...globals});
 return module.exports;
}
const trust=load('features/platform/transport/ApiRequestTrust.ts');
test('room creation separates receive negotiation without changing publish defaults',()=>{
 const source=read('features/voice/engine/v2/VoiceEngineV2AppConnectionHostAdapter.ts');
 const functionSource=source.slice(source.indexOf('function createRoomOptions('),source.indexOf('function createRoomConnectOptions('));
 const module={exports:{}};
 const publishDefaults={videoCodec:'h264',screenShareEncoding:{maxFramerate:60}};
 vm.runInNewContext(esbuild.transformSync(functionSource+'\nexport {createRoomOptions};',{loader:'ts',format:'cjs'}).code,
  {module,exports:module.exports,createRoomPublishDefaults:()=>publishDefaults,createWebAudioMixOption:()=>false});
 const {roomOptions}=module.exports.createRoomOptions(null,['av1']);
 assert.equal(roomOptions.singlePeerConnection,false);
 assert.equal(roomOptions.publishDefaults,publishDefaults);
 assert.equal(roomOptions.subscriberVideoCodecExclusions[0],'av1');
 assert.equal(roomOptions.dynacast,true);
});
const documentOrigin='https://client.fluxer.invalid';
const baseUrl='https://chat.lepast.fr/api';
test('embedded client trusts relative calls to its configured API',()=>{
 assert.equal(trust.isTrustedApiRequest('/channels/123/messages',baseUrl+'/v1/channels/123/messages',baseUrl,documentOrigin),true);
 assert.equal(trust.isTrustedApiRequest('/users/@me','https://chat.lepast.fr/api/v1/users/@me','/api','https://chat.lepast.fr'),true);
});
test('external, absolute, credentialed and API-escaping calls are untrusted',()=>{
 for(const [p,url] of [
  ['https://chat.lepast.fr/api/v1/users/@me',baseUrl+'/v1/users/@me'],
  ['//evil.test/foo','https://evil.test/foo'],
  ['/users/@me','https://chat.lepast.fr.evil.test/api/v1/users/@me'],
  ['/../../private','https://chat.lepast.fr/private'],
  ['/users/@me','https://user@chat.lepast.fr/api/v1/users/@me'],
  ['/users/@me','http://chat.lepast.fr/api/v1/users/@me'],
 ]) assert.equal(trust.isTrustedApiRequest(p,url,baseUrl,documentOrigin),false,p);
});
test('real request planner attaches synthetic credentials to message history only for API calls',()=>{
 const {composePlan}=load('features/platform/transport/RestTransport.ts',{
  window:{location:{origin:documentOrigin}},
  require:p=>p.endsWith('ApiRequestTrust')?trust:p.endsWith('AppLogger')?{Logger:class{}}:p.endsWith('EndpointError')?{HttpError:Error}:{APIErrorCodes:{}},
 },'\nexport {composePlan};');
 const state={baseUrl,apiVersion:1,authProvider:()=> 'SYNTHETIC-NOT-A-REAL-TOKEN',sudo:{tokenProvider:()=> 'SYNTHETIC-SUDO'}};
 const plan=composePlan(state,'GET','/channels/123/messages',{query:{limit:50}},false);
 assert.equal(plan.headers.Authorization,'SYNTHETIC-NOT-A-REAL-TOKEN');
 assert.equal(plan.url,baseUrl+'/v1/channels/123/messages?limit=50');
 for(const p of ['https://external.invalid/file','//external.invalid/file',baseUrl+'/v1/users/@me']){
  const headers=composePlan(state,'GET',p,{},false).headers;
  assert.equal(headers.Authorization,undefined);
  assert.equal(headers['x-fluxer-sudo-mode-jwt'],undefined);
 }
 assert.equal(composePlan(state,'POST','/auth/login',{auth:'none'},false).headers.Authorization,undefined);
});
const capturePath='features/voice/engine/voice_screen_share_manager/DeviceMediaCapture.ts';
function capture(gum) {
 return load(capturePath,{navigator:{mediaDevices:{getUserMedia:gum}},setTimeout:f=>{f();return 0;},
  require:()=>({logger:{warn(){}},stopMediaTrack:t=>t.stop(),stopUnselectedStreamTracks(){}})});
}
const video={stop(){}};
const stream={getVideoTracks:()=>[video],getAudioTracks:()=>[],getTracks:()=>[video]};
test('busy UVC retries remain bounded and always keep exact chosen device',async()=>{
 const calls=[];
 const {createDeviceReplacementTracks}=capture(async c=>{calls.push(c);throw new DOMException('busy','NotReadableError');});
 await assert.rejects(createDeviceReplacementTracks({videoDeviceId:'selected-elgato'}),{name:'NotReadableError'});
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.video.deviceId.exact==='selected-elgato'));
});
test('UVC succeeds after the driver finishes releasing preview',async()=>{
 let calls=0;
 const {createDeviceReplacementTracks}=capture(async()=>{if(++calls===1)throw new DOMException('busy','NotReadableError');return stream;});
 assert.equal((await createDeviceReplacementTracks({videoDeviceId:'selected-elgato'})).videoTrack,video);
 assert.equal(calls,2);
});
test('permission denied never retries and unsupported resolution never switches camera',async()=>{
 let calls=0;
 await assert.rejects(capture(async()=>{calls++;throw new DOMException('denied','NotAllowedError');}).createDeviceReplacementTracks(),{name:'NotAllowedError'});
 assert.equal(calls,1);
 const constraints=[];
 const c=capture(async v=>{constraints.push(v);if(constraints.length===1)throw Object.assign(new Error('resolution'),{name:'OverconstrainedError',constraint:'width'});return stream;});
 await c.createDeviceReplacementTracks({videoDeviceId:'elgato',resolution:{width:2560,height:1440,frameRate:60}});
 assert.equal(constraints[1].video.deviceId.exact,'elgato');
 assert.equal(constraints[1].video.width,undefined);
});
test('picker does not acquire camera previews before Stream is pressed',()=>{
 const source=read('features/voice/components/modals/screen_share_picker_modal/PickerGrid.tsx');
 assert.ok(source.includes('const AUTOMATIC_DEVICE_PREVIEWS = false'));
 assert.ok(source.includes('devicePreviewsEnabled && AUTOMATIC_DEVICE_PREVIEWS'));
});
test('device errors are actionable and never expose raw exception content',()=>{
 const {deviceShareErrorMessage}=load('features/voice/utils/DeviceShareErrorMessage.ts');
 assert.match(deviceShareErrorMessage({name:'NotReadableError',message:'PRIVATE-ID'},'fr'),/OBS/);
 assert.ok(!deviceShareErrorMessage({name:'NotReadableError',message:'PRIVATE-ID'},'fr').includes('PRIVATE-ID'));
 assert.match(deviceShareErrorMessage({name:'NotAllowedError'},'en'),/access denied/);
});
