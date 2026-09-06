// SPDX-License-Identifier: AGPL-3.0-or-later
// Exercises the installed client's REAL updater, with an isolated unauthenticated profile.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('./test-tools/package.json',import.meta.url));
const {_electron}=require('playwright-core');
const config=JSON.parse(await readFile(new URL('./config.json',import.meta.url),'utf8'));
const installed=path.join(process.env.LOCALAPPDATA,'FluxerLePast/current');
const env={...process.env,LEPAST_TEST_PROFILE:'smoke'};
delete env.ELECTRON_RUN_AS_NODE;
const instance=await _electron.launch({executablePath:path.join(installed,'Fluxer LePast.exe'),args:[],env,timeout:45000});
const events=[];
try{
 const page=await instance.firstWindow();
 await page.waitForFunction(()=>!!window.electron?.updaterCheck);
 const oldVersion=await instance.evaluate(({app})=>app.getVersion());
 assert.notEqual(oldVersion,config.version,'Test needs an older installed version');
 await page.evaluate(()=>{window.__lepastUpdateEvents=[];window.electron.onUpdaterEvent(e=>window.__lepastUpdateEvents.push(e));});
 await page.evaluate(()=>window.electron.updaterCheck('user'));
 await page.waitForFunction(()=>window.__lepastUpdateEvents.some(e=>e.type==='available'||e.type==='error'),null,{timeout:30000});
 let updates=await page.evaluate(()=>window.__lepastUpdateEvents);
 assert.ok(!updates.some(e=>e.type==='error'),JSON.stringify(updates));
 assert.ok(updates.some(e=>e.type==='available'&&e.version===config.version));
 console.log('Detected update from our configured feed: '+oldVersion+' -> '+config.version);
 await page.evaluate(()=>window.electron.updaterDownload('user'));
 updates=await page.evaluate(()=>window.__lepastUpdateEvents);
 assert.ok(updates.some(e=>e.type==='downloaded'),JSON.stringify(updates));
 events.push(...updates);
 console.log('Downloaded and checked update package; applying.');
 // Keep the real renderer IPC entry point, but suppress its optional relaunch so
 // the test can reopen the installed binary in a clean Playwright session.
 // No replacement of update logic, feed, hash checks or package application.
 await instance.evaluate(()=>{
   const {createRequire}=process.getBuiltinModule('node:module');
   const require=createRequire(process.resourcesPath+'/app.asar/package.json');
   const {UpdateManager}=require('velopack');
   const original=UpdateManager.prototype.waitExitThenApplyUpdate;
   UpdateManager.prototype.waitExitThenApplyUpdate=function(update){return original.call(this,update,true,false);};
 });
 await page.evaluate(()=>window.electron.updaterInstall()).catch(e=>{
   if(!/closed|destroyed/i.test(e.message))throw e;
 });
 const deadline=Date.now()+60000;
 let manifest='';
 while(Date.now()<deadline){
   try{manifest=await readFile(path.join(installed,'sq.version'),'utf8');}catch{}
   if(manifest.includes('<version>'+config.version+'</version>'))break;
   await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.ok(manifest.includes('<version>'+config.version+'</version>'),'Update was not applied');
 await writeFile(new URL('./reports/update.json',import.meta.url),JSON.stringify({passed:true,from:oldVersion,to:config.version,feed:config.updateBase,events},null,2));
 console.log('Installed manifest now at '+config.version);
}finally{await instance.close().catch(()=>{});}
