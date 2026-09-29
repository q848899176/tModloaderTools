import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { worldPath, validateSettings } from '../server/config.ts';
import { listWorlds, readEnabled, saveEnabled } from '../server/files.ts';

test('世界路径拒绝穿越、设备名与配置换行', () => {
  for (const name of ['../other', 'a\\b', 'NUL', 'a\nport=1', 'test.', 'a:w']) assert.throws(() => worldPath('C:/save', name));
  assert.equal(path.basename(worldPath('C:/save', '翅膀天堂')), '翅膀天堂.wld');
  assert.throws(() => validateSettings({ port: 7777, motd: 'a\nport=1' }));
});

test('世界枚举保留中文名，不将备份列为世界', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tml-test-'));
  await mkdir(path.join(root, 'Worlds'));
  for (const name of ['翅膀天堂.wld', '翅膀天堂.twld', '翅膀天堂.wld.bak']) await writeFile(path.join(root, 'Worlds', name), 'world');
  const worlds = await listWorlds(root);
  assert.equal(worlds.length, 1);
  assert.equal(worlds[0].name, '翅膀天堂');
  assert.equal(worlds[0].hasModData, true);
});

test('旧版本启用列表不能覆盖外部修改，成功写入保留备份', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tml-test-'));
  await mkdir(path.join(root, 'Mods'));
  const file = path.join(root, 'Mods/enabled.json');
  await writeFile(file, '["Original"]');
  const initial = await readEnabled(root);
  await saveEnabled(root, ['Original', 'NewMod'], initial.revision);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), ['Original', 'NewMod']);
  assert.equal(await readFile(`${file}.webtools.bak`, 'utf8'), '["Original"]');
  await assert.rejects(saveEnabled(root, [], initial.revision), /变化|刷新/);
  assert.deepEqual((await readEnabled(root)).names, ['Original', 'NewMod']);
});
