import {mkdir,cp,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import {defaults,ROOT,atomicJson,beijing} from '../server/config.ts';
const data=path.join(ROOT,'.tools','api-test-data'),saveDir=path.join(ROOT,'.tools','api-test-save');
await mkdir(saveDir,{recursive:true});
await cp(path.join(defaults.saveDir,'Mods'),path.join(saveDir,'Mods'),{recursive:true});
await cp(path.join(defaults.saveDir,'ModConfigs'),path.join(saveDir,'ModConfigs'),{recursive:true});
await cp(path.join(ROOT,'.tools','acceptance-save','Worlds'),path.join(saveDir,'Worlds'),{recursive:true});
const original=await readFile(path.join(defaults.saveDir,'Mods','enabled.json'),'utf8');
await atomicJson(path.join(data,'settings.json'),{...defaults,saveDir,world:'工具验收世界20260929',webPort:3031,port:17778});
const child=spawn(process.execPath,['server/index.ts'],{cwd:ROOT,windowsHide:true,env:{...process.env,TMLTOOLS_DATA:data},stdio:['ignore','pipe','pipe']});
child.stdout!.on('data',b=>console.log(b.toString()));child.stderr!.on('data',b=>console.error(b.toString()));
const base='http://127.0.0.1:3031/api';
async function request(url:string,body?:unknown){const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Tmod-Tools':'1'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json() as any;if(!r.ok)throw new Error(d.error);return d;}
let running=false;
try{
  let state:any;
  for(let n=0;n<30;n++){try{state=await request('/state');break;}catch{await new Promise(r=>setTimeout(r,1000));}}
  assert.equal(state.enabled.length,28);assert.equal(state.worlds.length,1);
  await request('/server/start',{world:'工具验收世界20260929'});running=true;
  await assert.rejects(request('/server/start',{world:'工具验收世界20260929'}));
  const deadline=Date.now()+600000;
  do{await new Promise(r=>setTimeout(r,3000));state=await request('/state');console.log(beijing(),state.server.state,state.logs.at(-1)?.text);}while(state.server.state==='starting'&&Date.now()<deadline);
  assert.equal(state.server.state,'running');
  await request('/server/save',{});await new Promise(r=>setTimeout(r,5000));
  await request('/server/stop',{});
  for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,2000));state=await request('/state');if(state.server.state==='stopped')break;}
  assert.equal(state.server.state,'stopped');running=false;
  assert.equal(await readFile(path.join(defaults.saveDir,'Mods','enabled.json'),'utf8'),original);
  console.log(`API ACCEPTANCE: PASS · 28 Mod配置 · 正常保存关闭 · ${beijing()}`);
}finally{
  if(running){try{await request('/server/stop',{});}catch{}console.error('TEST SERVER STILL RUNNING: 保留控制后端，等待处理');}
  else {const exited=once(child,'close');child.kill();await exited;}
}
