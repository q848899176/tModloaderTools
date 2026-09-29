import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import type { Settings } from '../shared/types.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.TMLTOOLS_DATA ? path.resolve(process.env.TMLTOOLS_DATA) : path.join(ROOT, 'data');
export function beijing(date = new Date()) { return new Date(date.getTime() + 8 * 3600000).toISOString().replace('Z', '+08:00'); }
export const defaults: Settings = {
  installDir: 'D:\\Steam\\steamapps\\common\\tModLoader',
  saveDir: path.join(homedir(), 'Documents', 'Terraria', 'tModLoader'),
  workshopDir: 'D:\\Steam\\steamapps\\workshop\\content\\1281930',
  webPort: 3000, serverName: '我的泰拉世界', port: 7777, maxPlayers: 8, password: '',
  motd: '欢迎来到我们的泰拉世界！', world: '', difficulty: 1, worldSize: 1, seed: '',
};
export function worldPath(root: string, name: string) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i.test(name) || name === '..') throw new Error('世界名称无效，不能包含路径、特殊字符或系统保留名称');
  return path.join(path.resolve(root), 'Worlds', name + '.wld');
}
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置格式无效');
  const s = { ...defaults, ...input } as Settings;
  for (const key of ['installDir', 'saveDir', 'workshopDir', 'serverName', 'password', 'motd', 'seed', 'world'] as const) {
    if (typeof s[key] !== 'string' || s[key].length > 500 || /[\r\n\x00]/.test(s[key])) throw new Error('设置不能包含换行或控制字符');
  }
  for (const key of ['installDir', 'saveDir', 'workshopDir'] as const) if (!path.isAbsolute(s[key])) throw new Error('安装及存档目录必须是绝对路径');
  for (const [key, min, max] of [['webPort', 1024, 65535], ['port', 1024, 65535], ['maxPlayers', 1, 255], ['difficulty', 0, 3], ['worldSize', 1, 3]] as const) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) throw new Error(`${key} 必须在 ${min} 到 ${max} 之间`);
  }
  if (s.webPort === s.port) throw new Error('网页端口和游戏端口不能相同');
  if (s.world) worldPath(s.saveDir, s.world);
  return Object.fromEntries(Object.keys(defaults).map(k => [k, s[k as keyof Settings]])) as unknown as Settings;
}
export async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), {encoding:'utf8',flag:'wx'});
  await rename(temp, file);
}
export async function loadSettings(): Promise<Settings> {
  try { return validateSettings(JSON.parse(await readFile(path.join(DATA, 'settings.json'), 'utf8'))); }
  catch (e: any) { if (e.code === 'ENOENT') return { ...defaults }; throw e; }
}
