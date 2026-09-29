import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants, createReadStream, openSync, closeSync} from 'node:fs';
import {mkdir, readdir, copyFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ROOT, defaults, atomicJson, beijing} from '../server/config.ts';
import {ensurePortFree, gameProcesses} from '../server/process.ts';
import type {AppState, InstanceConfig, InstanceView} from '../shared/types.ts';

process.env.TZ='Asia/Shanghai';
const data=path.join(ROOT,'.tools','multi-test-data');
const save=path.join(data,'save');
const url='http://127.0.0.1:3032/api';
const run=beijing().replace(/[^0-9]/g,'').slice(0,17);
const names=[`双实例验收甲${run}`,`双实例验收乙${run}`];
const ids:string[]=[];
const checks:string[]=[];
let backend:ChildProcess|undefined;
let original:Record<string,string>|undefined;
let originalAfter:Record<string,string>|undefined;
let error:unknown;

function checkpoint(message:string){checks.push(message);console.log(`${beijing()} ${message}`);}
async function digest(file:string){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function snapshotOriginal(){
  const result:Record<string,string>={'Mods/enabled.json':await digest(path.join(defaults.saveDir,'Mods','enabled.json'))};
  async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())await walk(file);
    else if(entry.isFile())result[path.relative(defaults.saveDir,file)]=await digest(file);
  }}
  await walk(path.join(defaults.saveDir,'Worlds'));return result;
}
async function raw(endpoint:string,method='GET',body?:unknown){
  const response=await fetch(url+endpoint,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Tmod-Tools':'1'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  return {response,value:await response.json() as any};
}
async function api(endpoint:string,method='GET',body?:unknown){const {response,value}=await raw(endpoint,method,body);if(!response.ok)throw new Error(`${method} ${endpoint}: ${value.error}`);return value;}
async function rejected(endpoint:string,method:string,body:unknown,reason:RegExp){const {response,value}=await raw(endpoint,method,body);assert.equal(response.ok,false,`${endpoint} 应拒绝操作`);assert.match(value.error,reason);return value.error;}
async function until<T>(label:string,read:()=>Promise<T>,ready:(value:T)=>boolean,timeout=60000):Promise<T>{
  const deadline=Date.now()+timeout;let last:T|undefined,lastError:unknown;
  while(Date.now()<deadline){try{last=await read();if(ready(last))return last;}catch(e){lastError=e;}await delay(1000);}
  throw new Error(`${label} 超时：${lastError instanceof Error?lastError.message:JSON.stringify(last)}`);
}
function views(state:AppState){return ids.map(id=>state.instances.find(i=>i.config.id===id)!);}
async function waitState(expected:'running'|'stopped',timeout:number){
  return until(`等待双实例 ${expected}`,()=>api('/state') as Promise<AppState>,state=>{
    const current=views(state);
    for(const instance of current)if(instance?.server.state==='error')throw new Error(JSON.stringify(instance.server));
    return current.length===2&&current.every(i=>i?.server.state===expected);
  },timeout);
}

try {
  assert.equal(process.platform,'win32','真实验收需要 Windows');
  assert.equal((await gameProcesses()).length,0,'请先正常关闭游戏和外部服务端再验收');
  for(const port of [3032,17780,17781])await ensurePortFree(port);
  original=await snapshotOriginal();
  await mkdir(path.join(save,'Worlds'),{recursive:true});
  await mkdir(path.join(save,'Mods'),{recursive:true});
  await atomicJson(path.join(save,'Mods','enabled.json'),[]);
  const source=path.join(ROOT,'.tools','acceptance-save','Worlds','工具验收世界20260929');
  for(const name of names)for(const extension of ['.wld','.twld'])await copyFile(source+extension,path.join(save,'Worlds',name+extension),constants.COPYFILE_EXCL);
  const before=await Promise.all(names.map(name=>stat(path.join(save,'Worlds',name+'.wld'))));
  await atomicJson(path.join(data,'settings.json'),{...defaults,saveDir:save,webPort:3032,port:17780,world:''});
  const seed:InstanceConfig={id:'multi-acceptance-placeholder',name:'冲突保护验收',world:'',port:17782,maxPlayers:8,password:'',motd:'双实例验收',difficulty:1,worldSize:1,seed:'',secure:true,npcStream:60};
  await atomicJson(path.join(data,'instances.json'),[seed]);
  const logFile=path.join(data,`backend-${run}.log`),fd=openSync(logFile,'a');
  try{backend=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:ROOT,windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,TMLTOOLS_DATA:data,TZ:'Asia/Shanghai'}});}finally{closeSync(fd);}
  let launchError:Error|undefined;backend.once('error',e=>{launchError=e;});
  await until('管理 API 启动',async()=>{if(launchError)throw launchError;if(backend!.exitCode!==null)throw new Error(`管理进程退出 ${backend!.exitCode}，日志 ${logFile}`);return api('/health');},v=>v.app==='tmodloader-tools');
  checkpoint('隔离管理 API 已启动，原始存档已记录校验值');
  for(let i=0;i<2;i++){
    const state:AppState=await api('/instances','POST',{name:`验收实例${i+1}`,world:names[i],port:17780+i});
    const instance=state.instances.find(v=>v.config.world===names[i]);assert.ok(instance);ids.push(instance.config.id);
  }
  for(const id of ids)await api(`/instances/${id}/start`,'POST',{create:false});
  await waitState('running',180000);
  checkpoint('两个独立世界在 17780 / 17781 同时达到 running');
  const running:AppState=await api('/state');
  assert.equal(new Set(views(running).map(i=>i.server.pid)).size,2,'实例必须对应两个独立进程');
  const locked=await rejected('/mods','PUT',{names:[],revision:running.revision},/全部实例|共享|关闭/);
  await api(`/instances/${seed.id}`,'PUT',{world:names[0],port:17782});
  const worldConflict=await rejected(`/instances/${seed.id}/start`,'POST',{},/同一个世界/);
  const portConflict=await rejected(`/instances/${seed.id}`,'PUT',{world:names[1],port:17780},/端口/);
  await rejected(`/instances/${ids[0]}/start`,'POST',{},/已经运行|正在启动/);
  checkpoint(`共享 Mod 锁、同世界锁、同端口锁及重复启动锁均生效：${locked}；${worldConflict}；${portConflict}`);
  for(const id of ids){
    const players=await api(`/instances/${id}/players`);assert.equal(players.bridge,'ready');assert.deepEqual(players.players,[]);
    await rejected(`/instances/${id}/give`,'POST',{slot:0,playerName:'不在线的验收玩家',itemId:1,count:1},/离线/);
  }
  checkpoint('两实例管理桥均 ready，在线玩家为空，向离线玩家发物品均被游戏端拒绝');
  for(const id of ids)await api(`/instances/${id}/save`,'POST',{});
  await until('两个世界保存到磁盘',()=>Promise.all(names.map(name=>stat(path.join(save,'Worlds',name+'.wld')))),saved=>saved.every((file,i)=>file.size>10000&&file.mtimeMs>before[i].mtimeMs),45000);
  for(const id of ids)await api(`/instances/${id}/stop`,'POST',{});
  const stopped=await waitState('stopped',100000);
  assert.ok(views(stopped).every(i=>!i.server.pid));
  for(const name of names)assert.ok((await stat(path.join(save,'Worlds',name+'.twld'))).size>0);
  checkpoint('两个世界真实保存完成，两个实例均正常退出为 stopped');
} catch(e){error=e;console.error(`${beijing()} 验收失败：${e instanceof Error?e.stack:String(e)}`);}
finally {
  if(backend&&backend.exitCode===null){
    let safe=false;
    try{
      const state:AppState=await api('/state');
      for(const instance of state.instances)if(instance.server.pid&&instance.server.state!=='stopping')await api(`/instances/${instance.config.id}/stop`,'POST',{});
      await until('清理验收实例',()=>api('/state') as Promise<AppState>,state=>state.instances.every((i:InstanceView)=>!i.server.pid),100000);
      safe=true;
    }catch(e){error??=e;console.error('验收进程仍需正常关服，已保留隔离 API：'+url);}
    if(safe){const closed=new Promise<void>(resolve=>backend!.once('close',()=>resolve()));backend.kill();await closed;}else backend.unref();
  }
  if(original){try{originalAfter=await snapshotOriginal();assert.deepEqual(originalAfter,original);checkpoint('原用户 enabled.json 及 Worlds 全部文件 SHA-256 未改变');}catch(e){error??=e;console.error('原始存档校验失败：',e);}}
  await mkdir(data,{recursive:true});
  await writeFile(path.join(data,'result.json'),JSON.stringify({time:beijing(),passed:!error,checks,instances:ids,worlds:names,originalBefore:original,originalAfter,error:error instanceof Error?error.message:error?String(error):undefined},null,2));
}
if(error)process.exitCode=1;else checkpoint('MULTI ACCEPTANCE: PASS');
