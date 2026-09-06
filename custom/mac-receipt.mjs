// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>JSON.parse(readFileSync(path.join(root,p),'utf8'));
const config=read('custom/config.json');
const version=config.version;
const relative=`custom/releases/darwin-arm64/${version}`;
const dir=path.join(root,relative);
const smoke=read('custom/reports/smoke.json');
for(const name of ['app','dmg']) if(read(`${relative}/notarization-${name}.json`).status!=='Accepted')throw Error('Notarization gate failed');
if(!smoke.passed || smoke.state.origin!==config.embeddedOrigin || smoke.state.api!==config.instance+'/api')throw Error('Smoke gate failed');
const sourceCommit=readFileSync(path.join(root,'custom/source-commit.txt'),'utf8').trim();
if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw Error('Missing source commit');
const sha256={};
for(const ext of ['zip','dmg']) {
 const name=`Fluxer-LePast-${version}-darwin-arm64.${ext}`;
 sha256[name]=createHash('sha256').update(readFileSync(path.join(dir,name))).digest('hex');
}
const feed={currentRelease:version,releases:[{version,updateTo:{version,name:version,
 pub_date:new Date().toISOString(),notes:'Fluxer LePast — interface embarquée et mises à jour LePast.',
 url:`${config.downloadPage}releases/darwin-arm64/${version}/Fluxer-LePast-${version}-darwin-arm64.zip`}}]};
writeFileSync(path.join(dir,'RELEASES.json'),JSON.stringify(feed,null,2));
sha256['RELEASES.json']=createHash('sha256').update(readFileSync(path.join(dir,'RELEASES.json'))).digest('hex');
writeFileSync(path.join(dir,'release.json'),JSON.stringify({name:config.name,version,platform:'darwin-arm64',sourceCommit,
 upstreamCommit:config.upstreamCommit,upstreamTag:config.upstreamTag,
 sourceUrl:`https://github.com/ThePastPlayer/FluxerCustom/tree/${sourceCommit}`,
 signed:true,notarized:true,testsPassed:true,testedAt:new Date().toISOString(),sha256},null,2));
