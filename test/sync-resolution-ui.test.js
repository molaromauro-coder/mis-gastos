import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchingSyncChoices} from '../sync-engine.js';
test('saved selections are restored individually, and changed fields require a fresh choice',()=>{
 const previous=[{id:'a',local:65000,remote:0},{id:'b',local:'Vendida',remote:'Disponible'}],current=structuredClone(previous);current[1].remote='Uso personal';
 assert.deepEqual(matchingSyncChoices({conflicts:previous,choices:{a:'local',b:'local'}},current),{a:'local'});
 assert.deepEqual(matchingSyncChoices({conflicts:previous,choices:{a:'invalid'}},current),{});
});
test('resolution submission persists before retry and releases the iOS selector focus',()=>{
 const s=readFileSync(new URL('../cloud-sync.js',import.meta.url),'utf8'),start=s.indexOf("document.querySelector('#cloudSyncResolve')?.addEventListener"),end=s.indexOf("document.querySelector('#cloudSyncDownload')",start),handler=s.slice(start,end);
 assert.ok(handler.indexOf('document.activeElement?.blur()')<handler.indexOf('await run(queuedResolution)'));
 assert.ok(handler.indexOf('verifiedWrite(resolutionKey,queuedResolution)')<handler.indexOf('await run(queuedResolution)'));
 assert.match(s,/queuedResolution\.submitted\?queuedResolution:null/);assert.match(s,/select\.value=savedChoices\[conflict.id\]/);
 assert.match(s,/cloudSyncResolutionStatus/);assert.match(s,/addEventListener\('close',\(\)=>void run\(\)\)/);
});
test('saved settings do not block sync, while drafts, dialogs, input and unverified local writes remain guarded',()=>{
 const s=readFileSync(new URL('../app.js',import.meta.url),'utf8'),block=s.slice(s.indexOf('if(!sharedMode)cloudSyncController=installCloudSync'));
 assert.match(block,/localSaved:.*safeStoredValue\(STORAGE_KEY\)===JSON.stringify\(state\)/);
 assert.match(block,/canApply:\(\)=>!pending.length&&/);assert.doesNotMatch(block,/canApply:\(\)=>[^\n]*settingsHasChanges/);
 assert.match(block,/dialog\[open\]:not\(#settingsDialog\)/);assert.match(block,/activeElement\?\.matches\('input,textarea,select'\)/);
});
