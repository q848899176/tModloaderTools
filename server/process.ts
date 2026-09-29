import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { createServer, connect } from 'node:net';
import { writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DATA, ROOT, worldPath, beijing, validateSettings, atomicJson } from './config.ts';
import { exists, confined, assertNotLink, readEnabled, safeCopy } from './files.ts';
import type { ServerStatus, Settings, LogEntry, Player, InstanceConfig } from '../shared/types.ts';

const exec = promisify(execFile);
export async function runtimeVersion(installDir: string) {
  const {stdout} = await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','(Get-Item -LiteralPath $env:TML_CHECK_DLL).VersionInfo.ProductVersion'],{windowsHide:true,env:{...process.env,TML_CHECK_DLL:path.join(installDir,'tModLoader.dll')},timeout:15000});
  const version = stdout.match(/\+(\d{4}\.\d+\.\d+\.\d+)/)?.[1];
  if (!version) throw new Error('无法识别 tModLoader 版本，请检查安装目录');
  return version;
}
export async function gameProcesses(exclude?: number|number[]) {
  const {stdout} = await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process -Filter \"Name = 'dotnet.exe' OR Name = 'Terraria.exe' OR Name = 'tModLoader.exe'\" | Where-Object { $_.Name -ne 'dotnet.exe' -or $_.CommandLine -match 'tModLoader' } | Select-Object ProcessId,Name,CommandLine) | ConvertTo-Json -Compress"],{windowsHide:true,timeout:15000});
  const parsed = JSON.parse(stdout || '[]');
  const excluded=Array.isArray(exclude)?exclude:[exclude];
  return (Array.isArray(parsed)?parsed:[parsed]).filter(p=>!excluded.includes(p.ProcessId)) as {ProcessId:number;Name:string;CommandLine:string}[];
}
export async function ensurePortFree(port: number) {
  await new Promise<void>((resolve,reject)=>{
    const listener = createServer();
    listener.once('error',()=>reject(new Error(`端口 ${port} 已被占用`)));
    listener.listen(port,'0.0.0.0',()=>listener.close(()=>resolve()));
  });
}
export async function assertWorldSafe(root:string,name:string,create:boolean) {
  const file=worldPath(root,name),dir=path.dirname(file);
  if(!await exists(dir)) {if(create)return;throw new Error('世界目录不存在');}
  await confined(root,dir);
  const related=(await readdir(dir)).filter(n=>n.toLowerCase().startsWith(name.toLowerCase()+'.'));
  if(create&&related.length)throw new Error('同名世界或配套存档、备份已存在，不能覆盖');
  for(const entry of related){const target=path.join(dir,entry);await assertNotLink(target);await confined(root,target);}
  if(!create&&!await exists(file))throw new Error('请选择已存在的世界，或使用创建世界入口');
}
export async function copyModConfigs(saveDir:string,runRoot:string) {
  const configs=path.join(saveDir,'ModConfigs');
  if(await exists(configs))await cp(configs,path.join(runRoot,'ModConfigs'),{
    recursive:true,
    filter:async(source)=>{await assertNotLink(source);await confined(saveDir,source);return true;},
  });
}
export class ManagedServer {
  status: ServerStatus = {state:'stopped',message:'服务器尚未启动'};
  child?: ChildProcess;
  players:Player[]=[];
  bridge:'unknown'|'ready'|'unavailable'='unknown';
  private pending=new Map<string,{resolve:(result:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>();
  log: (text:string,level?:LogEntry['level'])=>void;
  private stopRequested = false;
  private inputEncoding: BufferEncoding = 'utf8';
  private timeout?: NodeJS.Timeout;
  private poll?: NodeJS.Timeout;
  constructor(log: (text:string,level?:LogEntry['level'])=>void) { this.log=log; }
  get active() { return !!this.child; }
  launch(executable:string,args:string[],cwd:string,world:string) {
    if (this.child) throw new Error('服务端已经运行或正在启动');
    this.stopRequested=false;
    const child = spawn(executable,args,{cwd,windowsHide:true,stdio:'pipe',env:{...process.env,TZ:'Asia/Shanghai',DOTNET_ROLL_FORWARD:'Disable',PATH:path.join(cwd,'Libraries','Native','Windows')+';'+process.env.PATH}});
    this.child=child;
    this.status={state:'starting',message:'正在加载 Mod 与世界',pid:child.pid,startedAt:beijing(),world};
    for (const stream of [child.stdout,child.stderr]) {
      createInterface({input:stream}).on('line',line=>{
        const clean = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim();
        const bridgeIndex=clean.indexOf('TWB:');
        if(bridgeIndex>=0){try{const reply=JSON.parse(clean.slice(bridgeIndex+4));const pending=this.pending.get(reply.requestId);if(pending){clearTimeout(pending.timer);this.pending.delete(reply.requestId);this.bridge='ready';if(reply.ok)pending.resolve(reply);else pending.reject(new Error(reply.error||'游戏端拒绝操作'));}return;}catch{}}
        if (clean) this.log(clean,stream===child.stderr?'error':'info');
      });
    }
    child.stdin.on('error',e=>this.log(`服务端输入失败：${e.message}`,'error'));
    child.once('error',e=>{ this.status={...this.status,state:'error',message:e.message};this.log(e.message,'error'); });
    child.once('close',code=>{
      clearTimeout(this.timeout); clearInterval(this.poll);
      const ok = this.stopRequested && code===0;
      this.status={...this.status,state:ok?'stopped':'error',pid:undefined,message:ok?'世界已保存，服务器已关闭':`服务端退出（${code ?? '启动失败'}），请检查日志`};
      this.child=undefined;
      this.players=[];this.bridge='unknown';
      for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('服务器已退出'));}this.pending.clear();
      this.log(this.status.message,ok?'success':'error');
    });
    return child;
  }
  async start(settings:Settings,create=false,options?:{instance:InstanceConfig;allowedPids:number[]}) {
    const s=validateSettings(settings);
    if (this.active) throw new Error('服务端已经运行');
    if ((await gameProcesses(options?.allowedPids)).length) throw new Error('检测到游戏客户端或外部服务端，请先关闭以保护共用存档');
    await ensurePortFree(s.port);
    const world=worldPath(s.saveDir,s.world);
    await assertWorldSafe(s.saveDir,s.world,create);
    if (!await exists(path.join(s.installDir,'dotnet','dotnet.exe'))) throw new Error('未找到 tModLoader 自带的 .NET 运行环境');
    await mkdir(path.join(s.saveDir,'Worlds'),{recursive:true});
    await confined(s.saveDir,path.dirname(world));
    if (!create) await confined(s.saveDir,world);
    await mkdir(DATA,{recursive:true});
    let runRoot=s.saveDir;
    const instanceRoot=options?path.join(DATA,'instances',options.instance.id):DATA;
    await mkdir(instanceRoot,{recursive:true});
    if(options){
      runRoot=path.join(instanceRoot,'runs',randomUUID());
      await mkdir(path.join(runRoot,'Mods'),{recursive:true});
      const sourceMods=path.join(s.saveDir,'Mods');
      if(await exists(sourceMods))for(const file of await readdir(sourceMods,{withFileTypes:true}))if(file.isFile()&&file.name.endsWith('.tmod'))await safeCopy(await confined(s.saveDir,path.join(sourceMods,file.name)),path.join(runRoot,'Mods',file.name));
      await copyModConfigs(s.saveDir,runRoot);
      const bridge=path.join(ROOT,'server-mod','TerraWebBridge.tmod');
      if(!await exists(bridge))throw new Error('缺少服务端管理 Mod，请先运行 scripts/build-bridge.ps1');
      await safeCopy(bridge,path.join(runRoot,'Mods','TerraWebBridge.tmod'));
      await atomicJson(path.join(runRoot,'Mods','enabled.json'),[...new Set([...(await readEnabled(s.saveDir)).names,'TerraWebBridge'])]);
    }
    const config = path.join(instanceRoot,'serverconfig.txt');
    const lines=[`world=${world}`,`worldname=${s.world}`,`port=${s.port}`,`maxplayers=${s.maxPlayers}`,`password=${s.password}`,`motd=${s.motd}`,'upnp=0','language=zh-Hans'];
    if(create) lines.push(`autocreate=${s.worldSize}`,`difficulty=${s.difficulty}`,`seed=${s.seed}`);
    if(options)lines.push(`secure=${options.instance.secure?1:0}`,`npcstream=${options.instance.npcStream}`);
    await writeFile(config,lines.join('\r\n'),'utf8');
    this.inputEncoding='utf16le';
    this.launch(path.join(s.installDir,'dotnet','dotnet.exe'),['tModLoader.dll','-server','-nosteam','-config',config,'-tmlsavedirectory',runRoot,'-modpath',path.join(runRoot,'Mods'),'-steamworkshopfolder',path.resolve(s.workshopDir,'..','..'),'-noupnp'],s.installDir,s.world);
    this.log(`正在启动世界「${s.world}」，游戏端口 ${s.port}`);
    this.poll=setInterval(()=>{
      if(this.status.state!=='starting') return;
      const socket=connect({host:'127.0.0.1',port:s.port});
      socket.setTimeout(800);
      socket.on('error',()=>socket.destroy()); socket.on('timeout',()=>socket.destroy());
      socket.once('connect',()=>{
        socket.destroy(); clearInterval(this.poll); clearTimeout(this.timeout);
        if(this.child && this.status.state==='starting') {this.status={...this.status,state:'running',message:'服务器已就绪，可以加入游戏'};this.log(this.status.message,'success');}
      });
    },1500);
    this.timeout=setTimeout(()=>{if(this.child && this.status.state==='starting') {this.status={...this.status,state:'error',message:'启动超过 10 分钟，进程仍在运行，请查看日志或保存关闭'};this.log(this.status.message,'error');}},600000);
  }
  requestBridge(command:'players'|'give',args:string[]=[]):Promise<any> {
    if(!this.child||this.status.state!=='running')return Promise.reject(new Error('服务器尚未就绪'));
    const id=randomUUID().replaceAll('-','');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);this.bridge='unavailable';reject(new Error('游戏端未在 15 秒内确认操作，请检查日志；不要重复提交发放请求'));},15000);
      this.pending.set(id,{resolve,reject,timer});
      this.child!.stdin!.write(Buffer.from(`twb ${id} ${command}${args.length?' '+args.join(' '):''}\n`,this.inputEncoding));
    });
  }
  async refreshPlayers(){if(this.status.state!=='running')return;try{const result=await this.requestBridge('players');this.players=result.players;}catch{this.bridge='unavailable';}}
  save() {
    if(!this.child || this.status.state!=='running') throw new Error('服务器尚未就绪');
    this.child.stdin!.write(Buffer.from(this.inputEncoding==='utf16le'?'保存\n':'save\n',this.inputEncoding)); this.log('已发送保存世界命令，请查看服务端保存结果');
  }
  stop() {
    if(!this.child) throw new Error('没有可控制的服务端进程');
    if(this.status.state==='stopping') throw new Error('正在等待世界保存并关闭');
    this.stopRequested=true; clearTimeout(this.timeout); clearInterval(this.poll);
    this.status={...this.status,state:'stopping',message:'正在保存世界并关闭，请稍候'};
    this.child.stdin!.write(Buffer.from(this.inputEncoding==='utf16le'?'退出\n':'exit\n',this.inputEncoding));
    this.timeout=setTimeout(()=>{if(this.child) {this.status={...this.status,state:'error',message:'关服等待超时，进程仍在运行；未强制终止，请查看日志'};this.log(this.status.message,'error');}},90000);
  }
}
