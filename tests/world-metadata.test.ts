import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorldMetadata } from '../server/world-metadata.ts';

// A minimal modern world header with deliberately distinct fields around IsCrimson.
function world(crimson: number) {
  const data = Buffer.alloc(512);
  data.writeUInt32LE(279, 0); data.write('relogic', 4); data[11] = 2;
  data.writeInt16LE(11, 24);
  for (let i = 0; i < 11; i++) data.writeInt32LE(i ? 400 : 72, 26 + i * 4);
  data.writeInt16LE(0, 70);
  let p = 72;
  const str = (value: string) => { const bytes = Buffer.from(value); data[p++] = bytes.length; bytes.copy(data, p); p += bytes.length; };
  str('测试世界'); str('seed-123'); p += 24;
  data.writeInt32LE(55, p); p += 20;
  data.writeInt32LE(1200, p); p += 4; data.writeInt32LE(4200, p); p += 4;
  data.writeInt32LE(2, p); p += 4;
  p += 8 + 8 + 1 + 68 + 8 + 24;
  data[p++] = 1; data.writeInt32LE(3, p); p += 4; data[p++] = 0; data[p++] = 1;
  p += 8; data[p] = crimson;
  return { data, evilOffset: p };
}

async function inspect(data: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'world-header-'));
  try { const file = join(dir, 'world.wld'); await writeFile(file, data); return await readWorldMetadata(file); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('reads actual header fields and distinguishes crimson from corruption', async () => {
  assert.deepEqual(await inspect(world(1).data), { evil: 'crimson', difficulty: 2, seed: 'seed-123', sizeLabel: '小型', worldTitle: '测试世界' });
  assert.equal((await inspect(world(0).data)).evil, 'corruption');
});

test('unknown versions, corrupt markers, invalid sections and truncated headers never guess evil', async () => {
  const invalid: Buffer[] = [Buffer.alloc(0), world(2).data];
  const version = world(1).data; version.writeUInt32LE(999, 0); invalid.push(version);
  const magic = world(1).data; magic[4] = 0; invalid.push(magic);
  const type = world(1).data; type[11] = 1; invalid.push(type);
  const pointer = world(1).data; pointer.writeInt32LE(5, 26); invalid.push(pointer);
  const end = world(1); end.data.writeInt32LE(end.evilOffset, 30); invalid.push(end.data);
  const length = world(1).data; length.fill(255, 72, 77); invalid.push(length);
  const truncated = world(1); invalid.push(truncated.data.subarray(0, truncated.evilOffset));
  for (const data of invalid) assert.equal((await inspect(data)).evil, 'unknown');
  assert.equal((await readWorldMetadata(join(tmpdir(), 'missing-world-header.wld'))).evil, 'unknown');
});
