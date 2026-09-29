import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkshopId, selectCompatible, checkDependencies, parseHeader } from '../server/mods.ts';
test('只接受工坊单项链接或数字 ID，拒绝伪造域名与命令', () => {
  assert.equal(parseWorkshopId('https://steamcommunity.com/sharedfiles/filedetails/?id=2563309347'), '2563309347');
  for (const input of ['https://steamcommunity.com.evil.test/?id=123', '123 & calc', 'http://127.0.0.1/?id=123', 'https://steamcommunity.com/other?id=123']) assert.throws(() => parseWorkshopId(input));
});
test('选择当前运行版本支持的最新工坊目录，排除旧 Terraria 分支', () => {
  assert.equal(selectCompatible(['2022.9', '2025.7', '2026.8'], '2026.7.3.0'), '2025.7');
  assert.equal(selectCompatible(['2022.9', '2026.8'], '2026.7.3.0'), undefined);
});
test('缺失依赖和依赖版本不足阻止启用', () => {
  const mods: any[] = [{name:'A',version:'1.0',compatible:true,dependencies:['B@2.0']},{name:'B',version:'1.0',compatible:true,dependencies:[]}];
  assert.throws(() => checkDependencies(mods, ['A']), /B/);
  assert.throws(() => checkDependencies(mods, ['A','B']), /版本/);
  mods[1].version = '2.0';
  assert.doesNotThrow(() => checkDependencies(mods, ['A','B']));
});
test('损坏包头不能被识别为有效 Mod', () => { assert.throws(() => parseHeader(Buffer.from('not a mod'), 9)); });
