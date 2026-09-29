import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {parse,compileScript} from 'vue/compiler-sfc';
import ts from 'typescript';
import {createRenderer,h,ref,nextTick} from 'vue';

test('玩家页收到相同实例实时快照时保留列表、选择和回执，切换实例才重置',async()=>{
  const file=path.resolve('tests',`.players-${randomUUID()}.mjs`);
  const {descriptor}=parse(await readFile('src/PlayersPanel.vue','utf8'));
  const script=compileScript(descriptor,{id:'players-regression'});
  await writeFile(file,ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  const oldFetch=globalThis.fetch;let requests=0,vm:any;
  globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({players:[{slot:0,name:'测试玩家',life:100,maxLife:100}],bridge:'ready'}));};
  const renderer=createRenderer<any,any>({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},patchProp(){}});
  const instance=ref({config:{id:'one'},server:{state:'running'}});
  const settle=async()=>{await nextTick();await new Promise(r=>setTimeout(r,0));await nextTick();};
  let app:any;
  try{
    const component=(await import(pathToFileURL(file).href)).default;component.render=()=>null;
    app=renderer.createApp({render:()=>h(component,{instance:instance.value,ref:(value:any)=>vm=value})});app.mount({});await settle();
    const state=vm.$.setupState;
    assert.equal(state.players.length,1);state.selection='0:测试玩家';state.receipt='已确认发放';state.itemId=42;
    for(let i=0;i<3;i++){instance.value={config:{id:'one'},server:{state:'running'}};await settle();}
    assert.equal(state.selection,'0:测试玩家');assert.equal(state.receipt,'已确认发放');assert.equal(state.itemId,42);assert.equal(requests,1);
    instance.value={config:{id:'two'},server:{state:'stopped'}};await settle();
    assert.equal(state.selection,'');assert.equal(state.players.length,0);assert.equal(state.receipt,'');
  }finally{app?.unmount();globalThis.fetch=oldFetch;await unlink(file);}
});
