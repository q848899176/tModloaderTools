import { spawn } from 'node:child_process';
import { readdir, mkdir, copyFile, rename, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { ROOT, DATA, atomicJson, beijing } from './config.ts';
import { exists, confined, safeCopy, assertNotLink } from './files.ts';
import { parseWorkshopId, readMod, selectCompatible, scanMods, compareVersion } from './mods.ts';
import type { Settings, Download, LogEntry, Mod } from '../shared/types.ts';

export function shouldInstall(downloaded:Mod,existing?:Mod) {return !existing||!existing.compatible||!!existing.error||compareVersion(downloaded.version,existing.version)>0;}

export function requiredWorkshopItems(html:string) {
  const start=/<div\b[^>]*\bid=["']RequiredItems["'][^>]*>/i.exec(html);
  if(!start)return [];
  const begin=start.index+start[0].length;
  const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=begin;
  let depth=1,end=begin,match:RegExpExecArray|null;
  while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(depth===0){end=match.index;break;}}
  return [...new Set([...html.slice(begin,end).matchAll(/href=["']https:\/\/steamcommunity\.com\/(?:workshop|sharedfiles)\/filedetails\/\?id=([1-9]\d*)["']/g)].map(m=>m[1]))].slice(0,20);
}
export async function runSteamCommand(executable:string,args:string[],cwd:string,id:string,onLine:(line:string)=>void) {
  for(let attempt=0;attempt<2;attempt++) {
    const result=await new Promise<{code:number|null;tail:string;success:boolean}>((resolve,reject)=>{
      const child=spawn(executable,args,{cwd,windowsHide:true,stdio:'pipe'});
      let tail='',success=false;
      const timer=setTimeout(()=>{child.kill();reject(new Error('Steam 下载超过 30 分钟，任务已停止，可重试'));},1800000);
      for(const stream of [child.stdout,child.stderr])createInterface({input:stream}).on('line',line=>{tail=(tail+'\n'+line).slice(-4000);if(line.includes(`Success. Downloaded item ${id}`))success=true;onLine(line);});
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('close',code=>{clearTimeout(timer);resolve({code,tail,success});});
    });
    if(result.code===0&&result.success)return;
    if(attempt===0&&result.code===7&&result.tail.includes('Update complete')){onLine('SteamCMD 更新完成，正在重新连接');continue;}
    throw new Error(`Steam 下载失败（${result.code}）：${result.tail.slice(-700)}`);
  }
}

export async function workshopDetails(id:string) {
  const response=await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',{method:'POST',body:new URLSearchParams({itemcount:'1','publishedfileids[0]':id}),signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw new Error(`Steam 信息服务返回 ${response.status}`);
  const body=await response.json() as any;
  const item=body.response?.publishedfiledetails?.[0];
  if(item?.result!==1 || Number(item.consumer_app_id)!==1281930) throw new Error('该条目不是可访问的 tModLoader Mod');
  if(Number(item.file_type)===2) throw new Error('请输入单项 Mod 链接，暂不支持合集');
  try {
    const page=await fetch(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,{signal:AbortSignal.timeout(15000)});
    if(page.ok){const html=await page.text();item.children=requiredWorkshopItems(html).map(publishedfileid=>({publishedfileid}));}
  }catch{item.dependencyWarning='工坊依赖信息暂时不可用，安装后仍会校验包内依赖';}
  return item;
}
export async function verifyPackage(file:string) {
  const stream=createReadStream(file,{start:4,end:1024});
  const chunks:Buffer[]=[];for await(const chunk of stream) chunks.push(Buffer.from(chunk));
  const header=Buffer.concat(chunks);
  let pos=0,length=0,shift=0,b:number;
  do { b=header[pos++];length+=(b&127)*2**shift;shift+=7;if(shift>35)throw new Error('Mod 包头损坏'); } while(b&128);
  pos+=length;
  const expected=header.subarray(pos,pos+20).toString('hex');
  const hash=createHash('sha1');
  for await(const chunk of createReadStream(file,{start:4+pos+280})) hash.update(chunk);
  if(hash.digest('hex')!==expected) throw new Error('Mod 文件完整性校验失败');
}
export class WorkshopQueue {
  jobs:Download[]=[];
  running=false;
  getSettings:()=>Settings;
  getVersion:()=>string;
  guard:()=>Promise<void>;
  log:(text:string,level?:LogEntry['level'])=>void;
  private saving:Promise<unknown>=Promise.resolve();
  private seenDependencies=new Set<string>();
  constructor(getSettings:()=>Settings,getVersion:()=>string,guard:()=>Promise<void>,log:(text:string,level?:LogEntry['level'])=>void) {
    this.getSettings=getSettings;this.getVersion=getVersion;this.guard=guard;this.log=log;
  }
  async restore() {
    try {
      const old=JSON.parse(await readFile(path.join(DATA,'downloads.json'),'utf8'));
      this.jobs=old.slice(-30).map((j:Download)=>['queued','downloading','installing'].includes(j.status)?{...j,status:'failed',message:'工具重启中断了任务，请重新下载'}:j);
    } catch(e:any) {if(e.code!=='ENOENT')this.log('下载记录无法读取，原文件保留','error');}
  }
  private async persist() { this.saving=this.saving.catch(()=>{}).then(()=>atomicJson(path.join(DATA,'downloads.json'),this.jobs));await this.saving; }
  async enqueue(input:unknown) {
    const id=parseWorkshopId(input);
    if(this.jobs.some(j=>j.id===id&&['queued','downloading','installing'].includes(j.status)))throw new Error('该 Mod 已在下载队列中');
    if(this.jobs.filter(j=>j.status==='queued').length>=20)throw new Error('下载队列已满');
    const job:Download={id,title:`工坊 ${id}`,status:'queued',message:'等待下载',updated:beijing()};
    this.jobs=this.jobs.filter(j=>j.id!==id).slice(-29);this.jobs.push(job);
    await this.persist();
    void this.run();return job;
  }
  private async run() {
    if(this.running)return;
    this.running=true;
    this.seenDependencies=new Set(this.jobs.map(j=>j.id));
    try {
      for(let job=this.jobs.find(j=>j.status==='queued');job;job=this.jobs.find(j=>j.status==='queued')) {
        try {
          await this.guard();
          const details=await workshopDetails(job.id);job.title=details.title;
          if(details.dependencyWarning)this.log(details.dependencyWarning);
          job.status='downloading';job.message='连接 Steam 并下载文件';job.updated=beijing();await this.persist();
          this.log(`开始下载 ${job.title}`);
          const steamDir=path.join(ROOT,'.tools','steamcmd'),executable=path.join(steamDir,'steamcmd.exe');
          if(!await exists(executable))throw new Error('缺少 SteamCMD，请运行安装环境脚本');
          await runSteamCommand(executable,['+login','anonymous','+workshop_download_item','1281930',job.id,'validate','+quit'],steamDir,job.id,line=>{job!.message=line.trim().slice(0,250)||job!.message;job!.updated=beijing();});
          await this.guard();job.status='installing';job.message='校验并安装兼容版本';await this.persist();
          const source=path.join(steamDir,'steamapps','workshop','content','1281930',job.id);
          const dirs=await readdir(source,{withFileTypes:true});
          const folder=selectCompatible(dirs.filter(d=>d.isDirectory()).map(d=>d.name),this.getVersion());
          const content=folder?path.join(source,folder):source;
          const files=(await readdir(content,{withFileTypes:true})).filter(d=>d.isFile()&&d.name.endsWith('.tmod'));
          if(files.length!==1)throw new Error('下载内容没有唯一的兼容 Mod 文件');
          const file=await confined(source,path.join(content,files[0].name));
          const mod=await readMod(file);await verifyPackage(file);
          if(compareVersion(mod.buildVersion,'2023.6')<0||compareVersion(mod.buildVersion,this.getVersion())>0)throw new Error('该 Mod 与当前 tModLoader 版本不兼容');
          const settings=this.getSettings(),mods=await scanMods(settings,this.getVersion());
          const existing=mods.find(m=>m.name===mod.name&&m.path);
          const target=existing?.path||path.join(settings.saveDir,'Mods',mod.name+'.tmod');
          await mkdir(path.dirname(target),{recursive:true});
          await confined(existing?.source==='Steam 工坊'?settings.workshopDir:settings.saveDir,path.dirname(target));
          if(shouldInstall(mod,existing)) {
            await this.guard();
            await assertNotLink(target);
            if(await exists(target))await safeCopy(target,`${target}.webtools.bak`);
            await safeCopy(file,target);
          }
          const installed=await readMod(target);
          if(compareVersion(installed.buildVersion,this.getVersion())>0)throw new Error('安装后的文件仍不兼容，请检查已有 Mod');
          const missing=installed.dependencies.map(d=>d.split('@')[0]).filter(d=>!mods.some(m=>m.name===d&&m.compatible&&!m.error));
          job.status='complete';job.message=missing.length?`已下载，启用前需补齐依赖：${missing.join('、')}`:'已安装，可以在 Mod 列表中启用';job.updated=beijing();
          this.log(`${job.title}：${job.message}`,'success');
          for(const child of (details.children||[]).slice(0,20)) {
            const id=String(child.publishedfileid||'');
            if(/^[1-9]\d+$/.test(id)&&!this.seenDependencies.has(id)&&!mods.some(m=>m.workshopId===id&&m.compatible&&!m.error)) {this.seenDependencies.add(id);await this.enqueue(id);}
          }
        } catch(e:any) {job.status='failed';job.message=e.message;job.updated=beijing();this.log(`下载失败：${e.message}`,'error');}
        await this.persist();
      }
    } catch(e:any) {this.log(`下载队列错误：${e.message}`,'error');}
    finally {this.running=false;}
  }
}
