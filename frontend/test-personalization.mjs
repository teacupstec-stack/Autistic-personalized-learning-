import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const storage = new Map();
globalThis.localStorage = {
 getItem: k => storage.get(k) ?? null,
 setItem: (k,v) => storage.set(k,v),
 removeItem: k => storage.delete(k),
};
async function sourceModule(path, strip = false) {
 let source = readFileSync(new URL(path, import.meta.url), 'utf8');
 if (strip) source = source.replace(/^import .*from '@mediapipe\/tasks-vision';/m, '');
 const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
 return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));
}
const memory = await sourceModule('./src/services/personalMemory.ts');
const a = Array(64).fill(0); a[0] = 1;
const b = Array(64).fill(0); b[1] = 1;
assert.equal(memory.readMemory('A').length, 0);
memory.remember('A','Help',a);
assert.equal(memory.readMemory('B').length, 0, 'Learners must remain isolated');
memory.remember('B','No',b);
assert.deepEqual(memory.personalPrototypes('A')[0],a);
assert.equal(memory.personalPrototypes('A')[4],null);
for(let i=0;i<30;i++) memory.remember('A','Help',a);
assert.equal(memory.readMemory('A').length,20,'Bounded recent memory');
assert.throws(()=>memory.remember('A','Help',[NaN]));
const before = memory.readMemory('A').length;
const save = localStorage.setItem;
localStorage.setItem=()=>{ throw Error('quota'); };
assert.throws(()=>memory.remember('A','No',b));
localStorage.setItem=save;
assert.equal(memory.readMemory('A').length,before);
memory.clearMemory('A');
assert.equal(memory.readMemory('B').length,1);
const { normalizeFrames }=await sourceModule('./src/services/handTracking.ts',true);
const frames=Array.from({length:32},(_,t)=>({
 time:t*65, masks:[0,1], coords:[
 Array.from({length:21},()=>[0,0,0]),
 Array.from({length:21},(_,j)=>[t*0.001,j*0.02,0])
 ]}));
const out=normalizeFrames(frames);
assert.equal(out.length,4096);
assert.equal(out[127],1);
assert.equal(out[126],0);
assert.ok(Math.abs(out[63+9*3+1]-1)<1e-6,'Palm scale matches Python');
assert.ok(Math.abs(out[31*128+63] - 0.031/0.18)<1e-6,'Wrist trajectory retained');
assert.throws(()=>normalizeFrames(frames.map(f=>({...f,masks:[0,0]}))));
console.log('Passed: isolation, confirmed updates, memory bounds, invalid input, storage failure, deletion isolation, normalization and tracking rejection.');

