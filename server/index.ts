import express from 'express';
import { networkInterfaces, hostname } from 'node:os';
import path from 'node:path';
import { appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { stat, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { loadSettings, atomicJson, DATA, ROOT, validateSettings, beijing } from './config.ts';
import { listWorlds, readEnabled, saveEnabled } from './files.ts';
import { scanMods, checkDependencies } from './mods.ts';
import { ManagedServer, gameProcesses, runtimeVersion } from './process.ts';
import { WorkshopQueue } from './workshop.ts';
import { apiGate } from './security.ts';
import { validateInstance, assertInstanceAvailable, configText, parseConfigText } from './instances.ts';
import type { AppState, LogEntry, InstanceConfig } from '../shared/types.ts';

process.env.TZ='Asia/Shanghai';
let settings=await loadSettings();
let version=await runtimeVersion(settings.installDir);
let mods=await scanMods(settings,version),worlds=await listWorlds(settings.saveDir),enabled=await readEnabled(settings.saveDir);
const addresses=Object.values(networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>a!.address);
const logs:LogEntry[]=[],listeners=new Set<express.Response>();
let serial=0,busy=false,external=false;
mkdirSync(DATA,{recursive:true});
function emit(event:string,data:unknown) { for(const res of listeners) { if(res.writableLength>1024*1024){res.end();listeners.delete(res);} else res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } }
function log(text:string,level:LogEntry['level']='info',instanceId?:string) {
  if(settings.password)text=text.replaceAll(settings.password,'••••••');
  for(const instance of instances.values())if(instance.config.password)text=text.replaceAll(instance.config.password,'••••••');
  const entry:LogEntry={id:++serial,time:beijing(),level,text:text.slice(0,4000),...(instanceId?{instanceId}:{})};
  logs.push(entry);if(logs.length>400)logs.shift();emit('log',entry);
  try {
    const file=path.join(DATA,'activity.log');
    try{if(statSync(file).size>2*1024*1024)renameSync(file,path.join(DATA,'activity.previous.log'));}catch{}
    appendFileSync(file,`${entry.time} [${level}] ${entry.text}\n`);
  }catch{}
}
const instances=new Map<string,{config:InstanceConfig;server:ManagedServer}>();
const instanceFile=path.join(DATA,'instances.json');
function defaultInstance():InstanceConfig {return {id:randomUUID(),name:settings.serverName,world:settings.world||worlds[0]?.name||'',port:settings.port,maxPlayers:settings.maxPlayers,password:settings.password,motd:settings.motd,difficulty:settings.difficulty,worldSize:settings.worldSize,seed:settings.seed,secure:true,npcStream:60};}
function addInstance(config:InstanceConfig) {instances.set(config.id,{config,server:new ManagedServer((text,level)=>log(text,level,config.id))});}
try {
  const saved=JSON.parse(await readFile(instanceFile,'utf8'));
  if(!Array.isArray(saved)||!saved.length)throw new Error('实例列表为空或格式无效');
  for(const entry of saved){const config=validateInstance(entry,settings.webPort);if(instances.has(config.id))throw new Error('实例标识重复');addInstance(config);}
}catch(error:any){if(error.code!=='ENOENT')throw error;addInstance(validateInstance(defaultInstance(),settings.webPort));await persistInstances();await writeInstanceConfig(instanceFor().config);}
async function persistInstances(){await atomicJson(instanceFile,[...instances.values()].map(i=>i.config));}
function assertUniquePort(config:InstanceConfig){if([...instances.values()].some(i=>i.config.id!==config.id&&i.config.port===config.port))throw new Error('游戏端口已分配给另一个实例，请选择不同端口');}
async function writeInstanceConfig(config:InstanceConfig){
  const dir=path.join(DATA,'instances',config.id);await mkdir(dir,{recursive:true});
  const target=path.join(dir,'serverconfig.txt'),temp=`${target}.${randomUUID()}.tmp`;
  await writeFile(temp,configText(config,settings.saveDir),{encoding:'utf8',flag:'wx'});await rename(temp,target);
}
function instanceFor(id?:string){const instance=id?instances.get(id):instances.values().next().value;if(!instance)throw new Error('实例不存在');return instance;}
function managedPids(){return [...instances.values()].map(i=>i.server.child?.pid).filter((pid):pid is number=>pid!==undefined);}
async function guardFiles() {
  if([...instances.values()].some(i=>i.server.active))throw new Error('请先保存并关闭全部实例，再修改共享 Mod 或文件');
  if((await gameProcesses()).length)throw new Error('游戏客户端或外部服务端正在运行，请先关闭以保护共用配置');
}
const downloads=new WorkshopQueue(()=>settings,()=>version,guardFiles,log);
await downloads.restore();
async function refresh() {mods=await scanMods(settings,version);worlds=await listWorlds(settings.saveDir);enabled=await readEnabled(settings.saveDir);}
function status(server=instanceFor().server) {return !server.active&&external?{state:'external' as const,message:'检测到客户端或外部服务端，请先关闭后再管理共用配置'}:server.status;}
function instanceViews(){return [...instances.values()].map(({config,server})=>({config,server:status(server),players:server.players,bridge:server.bridge,configText:configText(config,settings.saveDir)}));}
function liveState(){return {server:status(),instances:instanceViews(),downloads:downloads.jobs,busy:busy||downloads.running};}
function state():AppState {return {settings,version,mods,worlds,enabled:enabled.names,revision:enabled.revision,logs,urls:addresses.map(a=>`http://${a}:${settings.webPort}`),...liveState()};}
const app=express();app.disable('x-powered-by');
app.use(apiGate(['localhost','127.0.0.1','[::1]',hostname(),...addresses]));
app.use(express.json({limit:'128kb'}));
app.get('/api/health',(_req,res)=>res.json({app:'tmodloader-tools',version:'1.1.0'}));
app.get('/api/state',async(_req,res)=>{await refresh();res.json(state());});
app.get('/api/events',(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders();
  listeners.add(res);res.write(`event: status\ndata: ${JSON.stringify(liveState())}\n\n`);
  req.on('close',()=>listeners.delete(res));
});
async function mutation(res:express.Response,action:()=>Promise<void>,options={download:false}) {
  if(busy||(!options.download&&downloads.running))throw new Error('有操作正在执行，请稍候');
  busy=true;
  try{await action();await refresh();busy=false;res.json(state());}finally{busy=false;}
}
app.put('/api/settings',async(req,res)=>mutation(res,async()=>{
  await guardFiles();const next=validateSettings(req.body);
  for(const dir of [next.installDir,next.saveDir,next.workshopDir])if(!(await stat(dir)).isDirectory())throw new Error('设置的目录不存在');
  const nextVersion=await runtimeVersion(next.installDir);
  await readEnabled(next.saveDir);
  if(next.webPort!==settings.webPort)throw new Error('网页端口需修改 data/settings.json 后重启工具');
  await atomicJson(path.join(DATA,'settings.json'),next);settings=next;version=nextVersion;log('服务器与工具设置已保存');
}));
app.put('/api/mods',async(req,res)=>mutation(res,async()=>{
  await guardFiles();const names=req.body.names;
  if(!Array.isArray(names)||names.some(n=>typeof n!=='string')||names.length>2000)throw new Error('Mod 列表格式无效');
  const current=await scanMods(settings,version),old=await readEnabled(settings.saveDir);
  // Unknown enabled names remain untouched; they are not silently deleted during edits.
  const missing=old.names.filter(n=>!current.some(m=>m.name===n&&m.path));
  if(missing.some(n=>!names.includes(n)))throw new Error('无法移除未识别的既有启用项，请先补齐对应文件');
  checkDependencies(current,names.filter(n=>!missing.includes(n)));
  await saveEnabled(settings.saveDir,names,req.body.revision);log(`已保存 ${names.length} 个启用项，下次启动生效`,'success');
}));
app.post('/api/downloads',async(req,res)=>mutation(res,async()=>{await guardFiles();await downloads.enqueue(req.body.input);},{download:true}));
app.get('/api/instances',(_req,res)=>res.json({instances:instanceViews()}));
app.get('/api/instances/:id',(req,res)=>{instanceFor(req.params.id);res.json(instanceViews().find(i=>i.config.id===req.params.id));});
app.post('/api/instances',async(req,res)=>mutation(res,async()=>{
  if(instances.size>=24)throw new Error('最多创建 24 个实例');
  const base=defaultInstance();base.world='';base.name=`服务器 ${instances.size+1}`;
  while([...instances.values()].some(i=>i.config.port===base.port)||base.port===settings.webPort)base.port++;
  const config=validateInstance({...base,...req.body,id:base.id},settings.webPort);
  assertUniquePort(config);await writeInstanceConfig(config);
  addInstance(config);
  try{await persistInstances();}catch(error){instances.delete(config.id);throw error;}
  log(`已创建实例「${config.name}」`,'success',config.id);
}));
app.put('/api/instances/:id',async(req,res)=>mutation(res,async()=>{
  const instance=instanceFor(req.params.id);if(instance.server.active)throw new Error('请先保存并关闭该实例，再修改配置');
  const next=validateInstance({...instance.config,...req.body,id:instance.config.id},settings.webPort),previous=instance.config;
  assertUniquePort(next);await writeInstanceConfig(next);
  instance.config=next;try{await persistInstances();}catch(error){instance.config=previous;throw error;}
  log(`实例「${next.name}」配置已保存`,'success',next.id);
}));
app.delete('/api/instances/:id',async(req,res)=>mutation(res,async()=>{
  const instance=instanceFor(req.params.id);if(instance.server.active)throw new Error('请先保存并关闭该实例');
  if(instances.size===1)throw new Error('请至少保留一个实例');
  const remaining=[...instances.values()].filter(i=>i!==instance).map(i=>i.config);
  await atomicJson(instanceFile,remaining);instances.delete(instance.config.id);
  log(`已移除实例「${instance.config.name}」，世界存档仍保留`,'success',instance.config.id);
}));
app.get('/api/instances/:id/configText',(req,res)=>{const instance=instanceFor(req.params.id);res.json({text:configText(instance.config,settings.saveDir)});});
app.put('/api/instances/:id/configText',async(req,res)=>mutation(res,async()=>{
  const instance=instanceFor(req.params.id);if(instance.server.active)throw new Error('请先保存并关闭该实例，再修改配置');
  const next=validateInstance(parseConfigText(req.body.text??req.body.configText,instance.config,settings.saveDir),settings.webPort),previous=instance.config;
  assertUniquePort(next);await writeInstanceConfig(next);
  instance.config=next;try{await persistInstances();}catch(error){instance.config=previous;throw error;}
  log('服务器配置文本已保存','success',next.id);
}));
async function startInstance(id:string|undefined,body:any){
  const instance=instanceFor(id);
  const next=validateInstance({...instance.config,world:body.world??instance.config.world,worldSize:body.worldSize??instance.config.worldSize,difficulty:body.difficulty??instance.config.difficulty,seed:body.seed??instance.config.seed},settings.webPort);
  assertInstanceAvailable(next,[...instances.values()].map(i=>({config:i.config,active:i.server.active})));
  const fresh=await scanMods(settings,version),selection=await readEnabled(settings.saveDir);checkDependencies(fresh,selection.names);
  const previous=instance.config;instance.config=next;try{await persistInstances();}catch(error){instance.config=previous;throw error;}
  await instance.server.start({...settings,...next,serverName:next.name},body.create===true,{instance:next,allowedPids:managedPids()});
}
async function give(instance:ReturnType<typeof instanceFor>,body:any){
  if(busy||downloads.running)throw new Error('有操作正在执行，请稍候');
  const {slot,itemId,count}=body,name=body.playerName??body.name;
  if(!Number.isInteger(slot)||slot<0||slot>254||!Number.isInteger(itemId)||itemId<1||itemId>2147483647||!Number.isInteger(count)||count<1||count>2147483647)throw new Error('玩家槽位、物品 ID 或数量无效');
  if(typeof name!=='string'||!name||Buffer.byteLength(name,'utf8')>384||/[\x00-\x1f]/.test(name))throw new Error('玩家名称无效，请刷新在线玩家');
  const result=await instance.server.requestBridge('give',[String(slot),String(itemId),String(count),Buffer.from(name,'utf8').toString('base64url')]);
  log(`已在玩家「${name}」位置生成 ${result.item?.name??itemId} × ${count}（地面掉落）`,'success',instance.config.id);
  return result;
}
for(const prefix of ['/api/instances/:id','/api/server']){
  app.post<{id?:string}>(`${prefix}/start`,async(req,res)=>mutation(res,()=>startInstance(req.params.id,req.body)));
  app.post<{id?:string}>(`${prefix}/save`,(req,res)=>{instanceFor(req.params.id).server.save();res.json({ok:true});});
  app.post<{id?:string}>(`${prefix}/stop`,(req,res)=>{instanceFor(req.params.id).server.stop();res.json({ok:true});});
  app.get<{id?:string}>(`${prefix}/players`,async(req,res)=>{
    const server=instanceFor(req.params.id).server;
    if(server.status.state==='running'){const result=await server.requestBridge('players');server.players=result.players;}
    res.json({players:server.players,bridge:server.bridge});
  });
  app.post<{id?:string}>(`${prefix}/give`,async(req,res)=>res.json(await give(instanceFor(req.params.id),req.body)));
}
app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}));
app.use(express.static(path.join(ROOT,'dist')));
app.get('/{*path}',(_req,res)=>res.sendFile(path.join(ROOT,'dist','index.html')));
app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(!res.headersSent)res.status(err.status||400).json({error:err.message||'操作失败'});});
const http=app.listen(settings.webPort,'0.0.0.0',()=>log(`管理工具已启动：http://localhost:${settings.webPort}`,'success'));
http.on('error',error=>{console.error(error.message);process.exitCode=1;clearInterval(pushTimer);clearInterval(processTimer);clearInterval(playersTimer);});
const pushTimer=setInterval(()=>emit('status',liveState()),1000);
let checking=false;
const processTimer=setInterval(async()=>{if(checking)return;checking=true;try{external=(await gameProcesses(managedPids())).length>0;}catch(e:any){log(`进程检查失败：${e.message}`,'error');}finally{checking=false;}},5000);
let pollingPlayers=false;
const playersTimer=setInterval(async()=>{if(pollingPlayers)return;pollingPlayers=true;try{await Promise.allSettled([...instances.values()].map(i=>i.server.refreshPlayers()));}finally{pollingPlayers=false;}},5000);
console.log(`tModLoader Tools · http://localhost:${settings.webPort} · ${beijing()}`);
console.log(addresses.map(a=>`局域网：http://${a}:${settings.webPort}`).join('\n'));
