import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {assertWorldSafe,copyModConfigs} from '../server/process.ts';
import {safeCopy,readEnabled,saveEnabled} from '../server/files.ts';
import {shouldInstall} from '../server/workshop.ts';
test('创建世界不能覆盖孤立的 Mod 世界存档或备份',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'world-safe-'));await mkdir(path.join(root,'Worlds'));
  await writeFile(path.join(root,'Worlds','旧世界.twld'),'precious');
  await assert.rejects(assertWorldSafe(root,'旧世界',true),/存在|覆盖/);
  await writeFile(path.join(root,'Worlds','备份.wld.bak'),'precious');
  await assert.rejects(assertWorldSafe(root,'备份',true),/存在|覆盖/);
});
test('即使旧包版本更大，也须替换不兼容包为兼容下载',()=>{
  assert.equal(shouldInstall({version:'1.0'} as any,{version:'2.0',compatible:false} as any),true);
  assert.equal(shouldInstall({version:'1.0'} as any,{version:'2.0',compatible:true} as any),false);
});
test('配置备份不得通过已有符号链接覆盖目录外文件',async(t)=>{
  const root=await mkdtemp(path.join(tmpdir(),'backup-safe-'));await mkdir(path.join(root,'Mods'));
  const target=path.join(root,'precious.txt'),enabled=path.join(root,'Mods','enabled.json');
  await writeFile(target,'precious');await writeFile(enabled,'["A"]');
  try{await symlink(target,enabled+'.webtools.bak','file');}catch(e:any){if(e.code==='EPERM'){t.skip('本机未授予文件符号链接权限');return;}throw e;}
  await assert.rejects(saveEnabled(root,['B'],(await readEnabled(root)).revision),/链接/);
  assert.equal(await readFile(target,'utf8'),'precious');
});
test('实例复制配置保留普通文件并拒绝目录链接越界',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'configs-safe-'));
  const save=path.join(root,'save'),run=path.join(root,'run'),outside=path.join(root,'outside');
  await mkdir(path.join(save,'ModConfigs','nested'),{recursive:true});await mkdir(outside);
  await writeFile(path.join(save,'ModConfigs','nested','normal.json'),'{}');
  await copyModConfigs(save,run);
  assert.equal(await readFile(path.join(run,'ModConfigs','nested','normal.json'),'utf8'),'{}');
  await writeFile(path.join(outside,'private.json'),'private');
  await symlink(outside,path.join(save,'ModConfigs','nested','escape'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(copyModConfigs(save,path.join(root,'rejected')),/链接|超出/);
});
