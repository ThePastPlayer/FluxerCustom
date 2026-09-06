// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(path.join(root,'custom/config.json'),'utf8'));
const smoke=JSON.parse(await readFile(path.join(root,'custom/reports/smoke.json'),'utf8'));
if(!smoke.passed || smoke.state.origin!==config.embeddedOrigin || smoke.state.api!==config.instance+'/api')throw new Error('Smoke gate failed');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const changes=execFileSync('git',['diff','--name-only','HEAD','--','fluxer_desktop','fluxer_app','custom/config.json','custom/embed-client.mjs'],{cwd:root,encoding:'utf8'}).trim();
if(changes)throw new Error('Commit application source before producing release receipt: '+changes);
const sha256={};
const dir=path.join(root,'custom/releases',config.version);
for(const name of ['FluxerLePast-'+config.version+'-full.nupkg','FluxerLePast-win-Setup.exe','releases.win.json','RELEASES']){
 sha256[name]=createHash('sha256').update(await readFile(path.join(dir,name))).digest('hex');
}
await writeFile(path.join(dir,'release.json'),JSON.stringify({
 name:config.name,version:config.version,sourceCommit,upstreamCommit:config.upstreamCommit,
 upstreamTag:config.upstreamTag,sourceUrl:'https://github.com/ThePastPlayer/FluxerCustom/tree/'+sourceCommit,
 signed:false,testsPassed:true,testedAt:new Date().toISOString(),sha256
},null,2));
console.log('Release receipt ready: '+config.version);
