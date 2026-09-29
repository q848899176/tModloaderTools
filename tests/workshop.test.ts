import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runSteamCommand,requiredWorkshopItems} from '../server/workshop.ts';
test('SteamCMD 首次自更新退出 7 后重试，真正成功才完成',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'steam-test-'));
  const script="const fs=require('fs');let n=0;try{n=+fs.readFileSync('count','utf8')}catch{};fs.writeFileSync('count',String(n+1));if(n===0){console.log('Update complete, launching...');process.exit(7)}console.log('Success. Downloaded item 123');";
  await runSteamCommand(process.execPath,['-e',script],dir,'123',()=>{});
  assert.equal(await readFile(path.join(dir,'count'),'utf8'),'2');
});
test('退出 0 但没有下载成功标记仍然失败',async()=>{
  await assert.rejects(runSteamCommand(process.execPath,['-e',"console.log('ERROR! Download failed')"],process.cwd(),'123',()=>{}),/下载失败/);
});
test('依赖解析仅提取 RequiredItems 容器，忽略其它工坊链接',()=>{
  const html='<a href="https://steamcommunity.com/workshop/filedetails/?id=999">else</a><div id="RequiredItems"><a href="https://steamcommunity.com/workshop/filedetails/?id=123"><div>Mod</div></a></div><a href="https://steamcommunity.com/workshop/filedetails/?id=888">else</a>';
  assert.deepEqual(requiredWorkshopItems(html),['123']);
});
