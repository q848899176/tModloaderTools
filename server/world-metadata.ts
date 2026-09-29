import { open } from 'node:fs/promises';

export type WorldMetadata = {
  evil: 'crimson' | 'corruption' | 'unknown';
  difficulty: number;
  seed: string;
  sizeLabel: string;
  worldTitle: string;
};

export async function readWorldMetadata(file: string): Promise<WorldMetadata> {
  const unknown: WorldMetadata = { evil: 'unknown', difficulty: -1, seed: '', sizeLabel: '未知', worldTitle: '' };
  try {
    const handle = await open(file, 'r');
    let data: Buffer;
    let fileSize: number;
    try {
      fileSize = (await handle.stat()).size;
      const buffer = Buffer.alloc(Math.min(fileSize, 65536));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      data = buffer.subarray(0, bytesRead);
    } finally { await handle.close(); }
    let p = 0;
    let limit = data.length;
    const skip = (count: number) => {
      if (count < 0 || p + count > limit) throw new Error('Invalid world header bounds');
      const start = p; p += count; return start;
    };
    const int = () => data.readInt32LE(skip(4));
    const byte = () => data[skip(1)];
    const bool = () => { const value = byte(); if (value > 1) throw new Error('Invalid boolean'); return value === 1; };
    const str = () => {
      let length = 0;
      for (let shift = 0; shift < 35; shift += 7) {
        const value = byte(); length += (value & 127) * 2 ** shift;
        if (length > 4096) throw new Error('Oversized world string');
        if (!(value & 128)) return new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(skip(length), p));
      }
      throw new Error('Invalid string length');
    };
    // These two desktop formats share the verified header layout through IsCrimson.
    // Other versions remain unknown until their exact layout is reviewed.
    if (![269, 279].includes(int())) return unknown;
    if (data.subarray(skip(7), p).toString('ascii') !== 'relogic' || byte() !== 2) return unknown;
    skip(12);
    const sections = data.readInt16LE(skip(2));
    if (sections < 2 || sections > 32) return unknown;
    const pointers = Array.from({ length: sections }, int);
    const frameCount = data.readInt16LE(skip(2));
    if (frameCount < 0) return unknown;
    skip(Math.ceil(frameCount / 8));
    if (pointers[0] !== p || pointers.some((v, i) => v < p || v > fileSize || (i > 0 && v < pointers[i - 1]))) return unknown;
    limit = Math.min(limit, pointers[1]);
    const worldTitle = str();
    const seed = str();
    skip(8 + 16 + 4 + 16); // World-gen version, GUID, ID and world bounds.
    const height = int(); const width = int();
    if (height <= 0 || width <= 0 || height > 100000 || width > 100000) return unknown;
    const difficulty = int();
    if (difficulty < 0 || difficulty > 3) return unknown;
    for (let i = 0; i < 8; i++) bool(); // Secret-seed flags, including Zenith.
    skip(8 + 1 + 68 + 8 + 24); // Creation, moon, tree/cave styles, spawn, ground/rock/time.
    bool(); int(); bool(); bool(); skip(8);
    const evil = bool() ? 'crimson' : 'corruption';
    const sizeLabel = width === 4200 && height === 1200 ? '小型' : width === 6400 && height === 1800 ? '中型' : width === 8400 && height === 2400 ? '大型' : '自定义';
    return { evil, difficulty, seed, sizeLabel, worldTitle };
  } catch { return unknown; }
}
