// End-to-end Squirrel.Mac check on a disposable signed 1.0.3 copy.
// Uses the real LePast Mac HTTPS feed; never launches a personal app/profile.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
const {_electron}=createRequire(new URL('./test-tools/package.json',import.meta.url))('playwright-core');
const base='/Users/mac/FluxerCustom/custom/reports/update-from-1.0.3/Fluxer LePast.app';
const env={...process.env,LEPAST_TEST_PROFILE:'smoke'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:base+'/Contents/MacOS/Fluxer LePast',env,timeout:45000});
let installing=false;
try{
 const page=await app.firstWindow();await page.waitForURL('https://client.fluxer.invalid/**');
 const before=await app.evaluate(({app,autoUpdater})=>{
  globalThis.__macUpdateProof={events:[],downloaded:false,error:null,duplicateChecks:0};
  for(const name of ['checking-for-update','update-available','update-not-available'])autoUpdater.on(name,()=>globalThis.__macUpdateProof.events.push(name));
  autoUpdater.on('error',error=>{
   // The startup check can already be running when the test requests a check.
   if(error.message==='The command is disabled and cannot be executed'){globalThis.__macUpdateProof.duplicateChecks++;return;}
   globalThis.__macUpdateProof.error=error.message;
  });
  autoUpdater.on('update-downloaded',()=>{globalThis.__macUpdateProof.downloaded=true;});
  return {version:app.getVersion(),feed:autoUpdater.getFeedURL()};
 });
 assert.equal(before.version,'1.0.3');
 assert.ok(before.feed.startsWith('https://chat.lepast.fr/fluxer-custom/updates/darwin-arm64/RELEASES.json'));
 await page.evaluate(()=>window.electron.updaterCheck('user'));
 let state;
 for(let n=0;n<180;n++){
  state=await app.evaluate(()=>globalThis.__macUpdateProof);
  if(state.downloaded)break;
  if(state.error)throw Error(state.error);
  if(n%10===0)console.log(JSON.stringify({phase:'downloading',events:state.events}));
  await delay(3000);
 }
 assert.ok(state.downloaded,'Signed Mac update must be downloaded and verified by Squirrel');
 console.log(JSON.stringify({before,state}));
 installing=true;
 await page.evaluate(()=>window.electron.updaterInstall()).catch(()=>{});
 await app.waitForEvent('close',{timeout:30000}).catch(()=>{});
 let after;
 for(let n=0;n<60;n++){
  try{after=execFileSync('/usr/libexec/PlistBuddy',['-c','Print CFBundleShortVersionString',base+'/Contents/Info.plist'],{encoding:'utf8'}).trim();}catch{}
  if(after==='1.0.4')break;
  await delay(2000);
 }
 assert.equal(after,'1.0.4','Squirrel must install into the original disposable app location');
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',base]);
 execFileSync('/usr/sbin/spctl',['--assess','--type','execute',base]);
 writeFileSync('custom/reports/mac-update.json',JSON.stringify({passed:true,before,after,state},null,2));
 console.log('Real Mac automatic update installed: 1.0.3 -> 1.0.4; signature and Gatekeeper valid.');
}finally{
 if(!installing)await app.close();
 else {
  // Squirrel can relaunch after installation. Stop only this disposable
  // executable, never a normal /Applications client or another project.
  await delay(2500);
  const executable=base+'/Contents/MacOS/Fluxer LePast';
  const processes=execFileSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
  for(const line of processes.split('\n')){
   const match=line.match(/^\s*(\d+)\s+(.+)$/);
   if(match?.[2]===executable){try{process.kill(Number(match[1]),'SIGTERM');}catch{}}
  }
 }
}
