// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../fluxer_desktop/package.json',import.meta.url));
const {transformSync}=require('esbuild');
const root=new URL('../fluxer_app/src/',import.meta.url);
function load(file,imports={},globals={}) {
  const module={exports:{}};
  const source=transformSync(readFileSync(new URL(file,root),'utf8'),{
    loader:file.endsWith('.tsx')?'tsx':'ts',format:'cjs',jsx:'automatic',
  }).code;
  vm.runInNewContext(source,{module,exports:module.exports,console,Map,Set,
    require:name=>{
      if(name in imports)return Object.hasOwn(imports[name],'default') ? {__esModule:true,...imports[name]} : imports[name];
      throw new Error('Unexpected dependency: '+name);
    },...globals});
  return module.exports;
}
const base='@app/features/voice/';
const classification=load('features/voice/engine/VoiceTrackSource.ts');
const identity=load('features/voice/utils/VoiceParticipantIdentity.ts');
const keys=load('features/voice/components/StreamKeys.ts',{'@fluxer/constants/src/AppConstants':{ME:'@me'}});
const gains=load('features/voice/utils/VoiceVolumeUtils.ts');
const targetModule=load('features/voice/components/VoicePlaybackVolumeTarget.ts',{
  [base+'engine/VoiceTrackSource']:classification,
  [base+'utils/VoiceParticipantIdentity']:identity,
  [base+'components/StreamKeys']:keys,
});
const track=(connection='session-a',options={})=>({source:'screen_share',participant:{
  identity:'user_123_'+connection,isLocal:false,
  audioTrackPublications:new Map([
    ['mic',{source:'microphone',trackName:'microphone'}],
    ['screen',{source:'screen_share_audio',trackName:'screen-audio'}],
  ]),...options,
}});

test('the playback target is the focused stream, never its microphone or another session',()=>{
  const resolve=targetModule.resolveVoicePlaybackVolumeTarget;
  assert.equal(resolve(track(),'guild','channel').streamKey,'guild:channel:session-a');
  assert.equal(resolve(track('session-b'),null,'dm-channel').streamKey,'dm:dm-channel:session-b');
  assert.equal(resolve(null,'guild','channel').kind,'call');
  assert.equal(resolve({...track(),source:'camera'},'guild','channel').kind,'call');
  for(const t of [track('s',{isLocal:true}),track('s',{identity:'unknown'}),track('s',{audioTrackPublications:new Map([['mic',{source:'microphone'}]])})]) {
    assert.equal(resolve(t,'guild','channel').kind,'none','no whole-call mute fallback for silent/own/unidentified streams');
  }
});

test('the real footer handlers change only stream preferences; actual mic gain/enabled remain untouched',async()=>{
  const streamPrefs=new Map(); const events=[];
  const prefs={
    getVolume:key=>streamPrefs.get(key)?.volume??100,
    isMuted:key=>streamPrefs.get(key)?.muted??false,
    hasEntry:key=>streamPrefs.has(key),touchStream(){},
    setVolume(key,volume){streamPrefs.set(key,{...streamPrefs.get(key),volume});},
    setMuted(key,muted){streamPrefs.set(key,{...streamPrefs.get(key),muted});},
  };
  let outputVolume=100,deaf=false;
  const participantVolume=load('features/voice/state/ParticipantVolume.ts',{
    '@app/features/platform/utils/AppLogger':{Logger:class{debug(){}warn(){}error(){}}},
    '@app/features/platform/utils/MobXPersistence':{makePersistent:async()=>{}},
    [base+'components/StreamKeys']:keys,
    [base+'engine/VoiceEffectiveAudioState']:{getEffectiveAudioState:()=>({effectiveDeaf:deaf})},
    [base+'engine/VoiceTrackSource']:classification,
    [base+'state/RemoteVoicePlaybackBoost']:{getRemoteVoicePlaybackBoost:()=>1},
    [base+'state/StreamAudioPrefs']:{default:prefs},
    [base+'state/VoiceSettings']:{default:{getOutputVolume:()=>outputVolume}},
    [base+'utils/VoiceVolumeUtils']:gains,
    mobx:{makeAutoObservable(){}},
  },{window:{_mediaEngineFacade:{guildId:'guild',channelId:'channel',connectionId:'local'}}}).default;
  await Promise.resolve();
  const pub=source=>({source,isDesired:true,track:{kind:'audio',gain:0,setVolume(v){this.gain=v;}},enabled:true,setEnabled(v){this.enabled=v;}});
  const mic=pub('microphone'),screen=pub('screen_share_audio');
  const otherScreen=pub('screen_share_audio');
  const participant={identity:'user_123_session-a',audioTrackPublications:new Map([['mic',mic],['screen',screen]])};
  const otherSession={identity:'user_123_session-b',audioTrackPublications:new Map([['screen',otherScreen]])};
  const engine={applyLocalAudioPreferencesForUser(userId){
    events.push(userId); participantVolume.applySettingsToParticipant(participant); participantVolume.applySettingsToParticipant(otherSession);
  }};
  const jsx=(type,props,key)=>({type,props,key});
  const component=load('features/voice/components/VoicePlaybackVolumeControl.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},
    [base+'components/CallVolumeControl']:{CallVolumeControl:'global-call'},
    [base+'components/media_player/components/MediaVerticalVolumeControl']:{MediaVerticalVolumeControl:'stream-control'},
    [base+'components/VoicePlaybackVolumeTarget']:targetModule,
    [base+'engine/MediaEngineFacade']:{default:engine},
    [base+'state/StreamAudioPrefs']:{default:prefs},
    [base+'utils/VoiceVolumeUtils']:gains,
    '@lingui/react/macro':{useLingui:()=>({t:([s])=>s})},
    'mobx-react-lite':{observer:f=>f},
  }).VoicePlaybackVolumeControl;
  const render=()=>component({focusedTrack:track(),guildId:'guild',channelId:'channel'});
  participantVolume.setVolume('123',80);
  engine.applyLocalAudioPreferencesForUser('123');
  const micGain=mic.track.gain;
  assert.equal(render().type,'stream-control');
  assert.equal(render().props.ariaLabel,'Stream volume');
  render().props.onVolumeChange(.25);
  assert.equal(screen.track.gain,gains.composeVoiceVolumeGain(25,100));
  assert.equal(mic.track.gain,micGain); assert.equal(mic.enabled,true);
  assert.equal(otherScreen.track.gain,1); assert.equal(otherScreen.enabled,true);
  render().props.onToggleMute();
  assert.equal(screen.enabled,false); assert.equal(mic.enabled,true);
  assert.equal(mic.track.gain,micGain); assert.equal(otherScreen.enabled,true);
  render().props.onToggleMute(); assert.equal(screen.enabled,true);
  render().props.onVolumeChange(0); assert.equal(screen.track.gain,0); assert.equal(mic.track.gain,micGain);
  render().props.onVolumeChange(2); assert.equal(screen.track.gain,4); assert.equal(mic.track.gain,micGain);
  participantVolume.setLocalMute('123',true); engine.applyLocalAudioPreferencesForUser('123');
  assert.equal(mic.enabled,false); assert.equal(screen.enabled,true);
  deaf=true; engine.applyLocalAudioPreferencesForUser('123');
  assert.equal(screen.enabled,false); assert.equal(mic.enabled,false);
  assert.equal(outputVolume,100,'stream control never writes global output volume');
  assert.equal(participantVolume.getVolume('123'),80,'personal voice volume preserved');
  assert.equal(component({focusedTrack:null}).type,'global-call','audio-only call retains its master control');
  assert.ok(events.every(id=>id==='123'));
});

test('both full/popout and compact call footers pass their actual focus to the shared control',()=>{
  for(const path of ['features/voice/components/VoiceCallView.tsx','features/voice/components/compact_voice_call_view/CompactVoiceCallViewInner.tsx']) {
    const source=readFileSync(new URL(path,root),'utf8');
    assert.match(source,/<VoiceCallCornerControls\s+focusedTrack=/);
    assert.match(source,/channelId=\{channel.id\}/);
  }
});
