import path from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {defaults,ROOT} from '../server/config.ts';
import {WorkshopQueue} from '../server/workshop.ts';
import {readMod} from '../server/mods.ts';
const saveDir=path.join(ROOT,'.tools','download-test'), workshopDir=path.join(saveDir,'workshop','content','1281930');
await mkdir(path.join(saveDir,'Mods'),{recursive:true});await mkdir(workshopDir,{recursive:true});
await writeFile(path.join(saveDir,'Mods','enabled.json'),'[]');
const queue=new WorkshopQueue(()=>({...defaults,saveDir,workshopDir}),()=> '2026.7.3.0',async()=>{},console.log);
await queue.enqueue('2563309347');
let previous='';
while(queue.running){const message=queue.jobs[0].message;if(message!==previous){console.log(message);previous=message;}await new Promise(r=>setTimeout(r,2000));}
if(queue.jobs[0].status!=='complete')throw new Error(queue.jobs[0].message);
if(queue.jobs.some(job=>job.status!=='complete'))throw new Error('依赖下载未全部成功');
const mod=await readMod(path.join(saveDir,'Mods','MagicStorage.tmod'));
if(mod.name!=='MagicStorage'||await readFile(path.join(saveDir,'Mods','enabled.json'),'utf8')!=='[]')throw new Error('下载验收失败');
const dependency=await readMod(path.join(saveDir,'Mods','SerousCommonLib.tmod'));
if(dependency.name!=='SerousCommonLib')throw new Error('依赖补齐失败');
console.log(`DOWNLOAD ACCEPTANCE: PASS ${mod.name} ${mod.version}`);
