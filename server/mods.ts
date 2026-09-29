import path from 'node:path';
import { open, readdir, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { exists, readEnabled, confined } from './files.ts';
import type { Mod, Settings } from '../shared/types.ts';

export function parseWorkshopId(input: unknown): string {
  if (typeof input !== 'string' || input.length > 500) throw new Error('请输入有效的 Steam 创意工坊链接');
  let id = input.trim();
  if (!/^\d+$/.test(id)) {
    const url = new URL(id);
    if (url.protocol !== 'https:' || url.hostname !== 'steamcommunity.com' || url.port || url.username || url.password || !/^\/(sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname)) throw new Error('仅支持 Steam 创意工坊单项详情链接');
    id = url.searchParams.get('id') || '';
  }
  if (!/^[1-9]\d{0,19}$/.test(id)) throw new Error('工坊 ID 无效');
  return id;
}
export function compareVersion(a: string, b: string) {
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) - (bb[i] || 0);
  return 0;
}
export function selectCompatible(folders: string[], version: string) {
  return folders.filter(f => /^\d{4}\.\d{1,2}$/.test(f) && compareVersion(f, '2023.6') >= 0 && compareVersion(f, version) <= 0).sort(compareVersion).at(-1);
}
class Reader {
  buffer: Buffer; offset = 0;
  constructor(buffer: Buffer) { this.buffer = buffer; }
  skip(n: number) { if (n < 0 || this.offset + n > this.buffer.length) throw new Error('Mod 数据截断'); this.offset += n; }
  byte() { this.skip(1); return this.buffer[this.offset - 1]; }
  int() { this.skip(4); return this.buffer.readInt32LE(this.offset - 4); }
  string() {
    let len = 0, shift = 0, byte: number;
    do { byte = this.byte(); len += (byte & 127) * 2 ** shift; shift += 7; if (shift > 35) throw new Error('Mod 字符串长度无效'); } while (byte & 128);
    if (len > 2 * 1024 * 1024) throw new Error('Mod 元数据过大');
    this.skip(len); return this.buffer.toString('utf8', this.offset - len, this.offset);
  }
}
export function parseHeader(buffer: Buffer, fileSize: number) {
  if (buffer.toString('ascii', 0, 4) !== 'TMOD') throw new Error('不是有效的 .tmod 文件');
  const r = new Reader(buffer); r.skip(4);
  const buildVersion = r.string(); r.skip(276);
  const length = r.int();
  if (length !== fileSize - r.offset) throw new Error('Mod 数据长度不符，文件可能损坏');
  const name = r.string(), version = r.string();
  if (!name || /[\/\\\x00-\x1f]/.test(name) || name.length > 150 || !/^\d+(\.\d+){1,3}$/.test(version)) throw new Error('Mod 名称或版本无效');
  const count = r.int();
  if (count < 1 || count > 100000) throw new Error('Mod 文件表无效');
  let offset = 0;
  let info: {offset: number; length: number; stored: number} | undefined;
  for (let i=0; i<count; i++) {
    const entry = r.string(), size = r.int(), stored = r.int();
    if (size < 0 || stored < 0 || offset + stored > fileSize) throw new Error('Mod 文件表损坏');
    if (entry === 'Info') info = {offset, length:size, stored};
    offset += stored;
  }
  if (!info || info.length > 2*1024*1024 || info.stored > 2*1024*1024 || r.offset + offset !== fileSize) throw new Error('Mod 元数据缺失或损坏');
  info.offset += r.offset;
  return {name,version,buildVersion,info};
}
export async function readMod(file: string): Promise<Mod> {
  const handle = await open(file, 'r');
  try {
    const size = (await handle.stat()).size;
    const header = Buffer.alloc(Math.min(size, 8*1024*1024));
    await handle.read(header, 0, header.length, 0);
    const {name,version,buildVersion,info} = parseHeader(header, size);
    const bytes = Buffer.alloc(info.stored);
    await handle.read(bytes, 0, bytes.length, info.offset);
    const content = info.stored !== info.length ? inflateRawSync(bytes, {maxOutputLength: 2*1024*1024}) : bytes;
    if (content.length !== info.length) throw new Error('Mod 元数据解压长度不符');
    const r = new Reader(content), props: Record<string, any> = {};
    const lists = ['dllReferences','modReferences','weakReferences','sortAfter','sortBefore'];
    const flags = ['noCompile','!playableOnPreview','translationMod','!hideCode','!hideResources','includeSource'];
    const strings = ['author','version','displayName','homepage','description','eacPath','buildVersion','modSource'];
    for (let tag = r.string(); tag; tag = r.string()) {
      if (lists.includes(tag)) { const items: string[] = []; for (let item=r.string(); item; item=r.string()) items.push(item); props[tag]=items; }
      else if (flags.includes(tag)) props[tag] = true;
      else if (strings.includes(tag)) props[tag] = r.string();
      else if (tag === 'side') props.side = r.byte();
      else throw new Error(`未知 Mod 元数据字段：${tag}`);
    }
    return {name,version,buildVersion,displayName:(props.displayName || name).replace(/\[c\/[0-9a-fA-F]{6}:([^\]]*)\]/g,'$1'), author:props.author || '',dependencies:props.modReferences || [],side:props.side || 0,path:file,source:'本地',enabled:false,compatible:true};
  } finally { await handle.close(); }
}
export function checkDependencies(mods: Mod[], names: string[]) {
  const byName = new Map(mods.map(m => [m.name, m]));
  for (const name of names) {
    const mod = byName.get(name);
    if (!mod || mod.error || !mod.compatible) throw new Error(`${name} 缺失、损坏或不兼容`);
    for (const reference of mod.dependencies) {
      const [dep, required] = reference.split('@'), installed = byName.get(dep);
      if (!names.includes(dep) || !installed) throw new Error(`${mod.displayName} 缺少已启用的依赖 ${dep}`);
      if (required && compareVersion(installed.version, required) < 0) throw new Error(`${dep} 版本不足，需要 ${required}`);
    }
  }
}
export async function scanMods(settings: Settings, runtimeVersion: string): Promise<Mod[]> {
  const {names} = await readEnabled(settings.saveDir);
  const candidates: Mod[] = [];
  async function scanDirectory(dir: string, source: string, workshopId?: string) {
    if (!await exists(dir)) return;
    for (const entry of await readdir(dir, {withFileTypes:true})) {
      if (!entry.isFile() || !entry.name.endsWith('.tmod')) continue;
      const file = await confined(dir, path.join(dir,entry.name));
      try {
        const mod = await readMod(file);
        mod.source = source; mod.workshopId = workshopId; mod.enabled = names.includes(mod.name);
        mod.compatible = compareVersion(mod.buildVersion,'2023.6') >= 0 && compareVersion(mod.buildVersion,runtimeVersion) <= 0;
        candidates.push(mod);
      } catch(e: any) { candidates.push({name:entry.name.slice(0,-5),displayName:entry.name,version:'?',buildVersion:'?',author:'',dependencies:[],side:0,path:file,source,workshopId,enabled:names.includes(entry.name.slice(0,-5)),compatible:false,error:e.message}); }
    }
  }
  await scanDirectory(path.join(settings.saveDir,'Mods'),'本地');
  if (await exists(settings.workshopDir)) {
    for (const entry of await readdir(settings.workshopDir,{withFileTypes:true})) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const dir = await confined(settings.workshopDir,path.join(settings.workshopDir,entry.name));
      const sub = (await readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name);
      const folder = selectCompatible(sub,runtimeVersion);
      if (folder) await scanDirectory(await confined(dir,path.join(dir,folder)),'Steam 工坊',entry.name);
      else await scanDirectory(dir,'Steam 工坊',entry.name);
    }
  }
  const selected = new Map<string,Mod>();
  // Local packages win, matching tModLoader's local override behavior.
  for (const mod of candidates) {
    const current = selected.get(mod.name);
    if (!current || (current.source !== '本地' && compareVersion(mod.version,current.version)>0)) selected.set(mod.name,mod);
  }
  for (const name of names) if (!selected.has(name)) selected.set(name,{name,displayName:name,version:'—',buildVersion:'—',author:'',dependencies:[],side:0,path:'',source:'未找到',enabled:true,compatible:false,error:'已启用但找不到兼容的 Mod 文件，原启用项已保留'});
  return [...selected.values()].sort((a,b)=>Number(b.enabled)-Number(a.enabled)||a.displayName.localeCompare(b.displayName,'zh-CN'));
}
