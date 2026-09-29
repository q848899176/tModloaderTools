import path from 'node:path';
import { worldPath } from './config.ts';
import type {InstanceConfig} from '../shared/types.ts';

export function validateInstance(input:unknown,webPort:number):InstanceConfig {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('实例配置无效');
  const s=input as InstanceConfig;
  if(typeof s.id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(s.id))throw new Error('实例标识无效');
  for(const k of ['name','world','password','motd','seed'] as const)if(typeof s[k]!=='string'||s[k].length>500||/[\x00-\x1f]/.test(s[k]))throw new Error('配置不能包含控制字符或换行');
  if(!s.name.trim())throw new Error('实例名称不能为空');
  if(s.world)worldPath('C:/save',s.world);
  for(const [k,min,max]of [['port',1024,65535],['maxPlayers',1,255],['difficulty',0,3],['worldSize',1,3],['npcStream',0,300]] as const)if(!Number.isInteger(s[k])||s[k]<min||s[k]>max)throw new Error(`${k} 必须在 ${min} 到 ${max} 之间`);
  if(s.port===webPort)throw new Error('游戏端口不能与网页端口相同');
  if(typeof s.secure!=='boolean')throw new Error('secure 配置必须为布尔值');
  return Object.fromEntries(['id','name','world','port','maxPlayers','password','motd','difficulty','worldSize','seed','secure','npcStream'].map(k=>[k,s[k as keyof InstanceConfig]])) as unknown as InstanceConfig;
}
export function assertInstanceAvailable(candidate:InstanceConfig,instances:{config:InstanceConfig;active:boolean}[]) {
  for(const instance of instances) {
    if(!instance.active)continue;
    if(instance.config.id===candidate.id)throw new Error('该实例已经运行或正在启动');
    if(instance.config.port===candidate.port)throw new Error('该端口已被另一个实例使用');
    if(instance.config.world.toLowerCase()===candidate.world.toLowerCase())throw new Error('同一个世界不能同时运行在多个实例中');
  }
}
export function configText(s:InstanceConfig,saveDir:string) {
  return ['# 泰拉控制台 · 服务器配置 · 北京时间',s.world?`world=${worldPath(saveDir,s.world)}`:'# world=请选择世界',`worldname=${s.world}`,`port=${s.port}`,`maxplayers=${s.maxPlayers}`,`password=${s.password}`,`motd=${s.motd}`,`secure=${s.secure?1:0}`,`npcstream=${s.npcStream}`,`autocreate=${s.worldSize}`,`difficulty=${s.difficulty}`,`seed=${s.seed}`,'upnp=0','language=zh-Hans'].join('\r\n');
}
export function parseConfigText(text:unknown,base:InstanceConfig,saveDir:string) {
  if(typeof text!=='string'||text.length>32768)throw new Error('配置文本过长或无效');
  const next={...base},seen=new Set<string>();
  const keys:Record<string,keyof InstanceConfig>={worldname:'world',port:'port',maxplayers:'maxPlayers',password:'password',motd:'motd',secure:'secure',npcstream:'npcStream',autocreate:'worldSize',difficulty:'difficulty',seed:'seed'};
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const equal=line.indexOf('=');if(equal<0)throw new Error('每项配置需要使用 key=value 格式');
    const key=line.slice(0,equal).trim().toLowerCase(),value=line.slice(equal+1);
    if(seen.has(key))throw new Error(`配置项重复：${key}`);seen.add(key);
    if(key==='world') {
      const candidate=path.resolve(value),dir=path.resolve(saveDir,'Worlds');
      if(path.dirname(candidate).toLowerCase()!==dir.toLowerCase()||path.extname(candidate).toLowerCase()!=='.wld')throw new Error('世界路径必须在当前 Worlds 目录内');
      const name=path.basename(candidate,path.extname(candidate));
      if(seen.has('worldname')&&next.world!==name)throw new Error('world 与 worldname 必须一致');
      next.world=name;continue;
    }
    if(key==='language'){if(value!=='zh-Hans')throw new Error('控制台命令固定使用 zh-Hans');continue;}
    if(key==='upnp'){if(value!=='0')throw new Error('局域网工具不启用公网端口映射');continue;}
    if(!keys[key])throw new Error(`不支持的配置项：${key}`);
    if(key==='secure'){if(!['0','1'].includes(value))throw new Error('secure 只能是 0 或 1');next.secure=value==='1';}
    else if(['port','maxplayers','npcstream','autocreate','difficulty'].includes(key))(next as any)[keys[key]]=Number(value);
    else if(key==='worldname'&&seen.has('world')){if(value!==next.world)throw new Error('world 与 worldname 必须一致');}
    else (next as any)[keys[key]]=value;
  }
  return next;
}
