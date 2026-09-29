import path from 'node:path';
import { readdir, readFile, stat, copyFile, mkdir, realpath, lstat, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJson, beijing } from './config.ts';
import type { World } from '../shared/types.ts';
import { readWorldMetadata } from './world-metadata.ts';

export async function exists(file: string) { try { await stat(file); return true; } catch (e: any) { if (e.code === 'ENOENT') return false; throw e; } }
export async function assertNotLink(file:string) {
  try{if((await lstat(file)).isSymbolicLink())throw new Error('写入目标是符号链接，已拒绝操作');}catch(e:any){if(e.code!=='ENOENT')throw e;}
}
export async function safeCopy(source:string,target:string) {
  await assertNotLink(target);
  const temp=target+'.'+randomUUID()+'.tmp';
  await copyFile(source,temp,constants.COPYFILE_EXCL);
  await assertNotLink(target);
  await rename(temp,target);
}
export async function confined(root: string, file: string) {
  const base = await realpath(root), resolved = await realpath(file);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('路径超出允许目录');
  return resolved;
}
export async function listWorlds(root: string): Promise<World[]> {
  const dir = path.join(root, 'Worlds');
  if (!await exists(dir)) return [];
  await confined(root, dir);
  const entries = await readdir(dir, { withFileTypes: true });
  const worlds: World[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.wld')) continue;
    const file = await confined(dir, path.join(dir, entry.name)), info = await stat(file);
    worlds.push({ name: entry.name.slice(0, -4), size: info.size, modified: beijing(info.mtime), hasModData: await exists(file.slice(0, -4) + '.twld'), ...await readWorldMetadata(file) });
  }
  return worlds.sort((a,b) => b.modified.localeCompare(a.modified));
}
export async function readEnabled(root: string) {
  const file = path.join(root, 'Mods', 'enabled.json');
  let content = '[]';
  if (await exists(file)) { await confined(root, file); content = await readFile(file, 'utf8'); }
  const names = JSON.parse(content.replace(/^\uFEFF/, ''));
  if (!Array.isArray(names) || names.some(n => typeof n !== 'string')) throw new Error('现有 enabled.json 格式无效，已保留原文件');
  return { names: names as string[], revision: createHash('sha256').update(content).digest('hex') };
}
let writes: Promise<unknown> = Promise.resolve();
export function saveEnabled(root: string, names: string[], revision: string): Promise<void> {
  const operation = writes.catch(() => {}).then(async () => {
    if (!Array.isArray(names) || names.length > 2000 || names.some(n => typeof n !== 'string' || !n || n.length > 150 || /[\x00-\x1f/\\]/.test(n))) throw new Error('Mod 启用列表无效');
    const current = await readEnabled(root);
    if (revision !== current.revision) throw new Error('Mod 列表已发生变化，请刷新后重试');
    const dir = path.join(root, 'Mods');
    await mkdir(dir, { recursive: true });
    await confined(root, dir);
    const file = path.join(dir, 'enabled.json');
    if (await exists(file)) await safeCopy(file, `${file}.webtools.bak`);
    await atomicJson(file, [...new Set(names)]);
  });
  writes = operation;
  return operation;
}
