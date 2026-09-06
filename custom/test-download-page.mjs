// Project-owned unauthenticated Electron test window; no user browser/profile.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {_electron}=createRequire(new URL('./test-tools/package.json',import.meta.url))('playwright-core');
const html=readFileSync(new URL('./server/index.html',import.meta.url));
const route=readFileSync(new URL('./server/traefik.yml',import.meta.url),'utf8');
const policy=route.match(/Content-Security-Policy: "([^"]+)"/)[1];
const script=html.toString('utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\r\n/g,'\n');
assert.ok(policy.includes("'sha256-"+createHash('sha256').update(script).digest('base64')+"'"),'CSP must match the current selector');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',policy);res.end(html);});
await new Promise(resolve=>server.listen(17890,'127.0.0.1',resolve));
const pageUrl=process.argv.includes('--public')?'https://chat.lepast.fr/fluxer-custom/':'http://127.0.0.1:17890/';
const env={...process.env,LEPAST_TEST_PROFILE:'smoke'};delete env.ELECTRON_RUN_AS_NODE;
let app;
try{
 app=await _electron.launch({executablePath:'E:/FluxerCustom/fluxer_desktop/dist-electron/win-unpacked/Fluxer LePast.exe',env,timeout:45000});
 const event=app.waitForEvent('window');
 await app.evaluate(({BrowserWindow},url)=>{const w=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});w.loadURL(url);},pageUrl);
 const page=await event;
 await page.addInitScript(()=>{
  const raw=new URL(location.href).searchParams.get('test');
  if(!raw)return;
  const {platform,ua,touch}=JSON.parse(raw);
  Object.defineProperty(navigator,'platform',{get:()=>platform});
  Object.defineProperty(navigator,'userAgent',{get:()=>ua});
  Object.defineProperty(navigator,'maxTouchPoints',{get:()=>touch});
  Object.defineProperty(navigator,'userAgentData',{get:()=>undefined});
 });
 for(const [platform,ua,touch,expected] of [
  ['MacIntel','Mozilla/5.0 Macintosh',0,'current-darwin-arm64/'],
  ['Win32','Mozilla/5.0 Windows NT 10.0',0,'updates/win32-x64/'],
  ['MacIntel','Mozilla/5.0 Macintosh',5,null],
  ['Linux arm','Mozilla/5.0 Android',5,null],
 ]){
  const response=await page.goto(pageUrl+'?test='+encodeURIComponent(JSON.stringify({platform,ua,touch})));
  assert.equal(response.headers()['content-security-policy'],policy);
  const href=await page.locator('#recommended a').count()?await page.locator('#recommended a').getAttribute('href'):null;
  assert.ok(expected?href?.startsWith(expected):href===null,platform+' '+touch);
  assert.ok(await page.locator('#mac-download').isVisible());
  assert.ok(await page.locator('#windows-download').isVisible());
  if(platform==='MacIntel' && touch===0){await page.setViewportSize({width:1200,height:1250});await page.screenshot({path:'custom/reports/download-page-mac.png',fullPage:true});}
  if(touch===5){await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 }
 console.log('Download page: Mac, Windows, iPad, Android and narrow layout passed.');
}finally{await app?.close();server.close();}
