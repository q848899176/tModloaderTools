import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInstance,configText,parseConfigText,assertInstanceAvailable} from '../server/instances.ts';
import {defaults} from '../server/config.ts';
const base={id:'test',name:'世界一',world:'翅膀天堂',port:7777,maxPlayers:8,password:'',motd:'欢迎',difficulty:1,worldSize:1,seed:'',secure:false,npcStream:60};
test('配置文本完整往返，中文与等号保留，禁止任意目录和未知配置',()=>{
  const c={...base,password:'a=b'};
  assert.deepEqual(parseConfigText(configText(c,defaults.saveDir),c,defaults.saveDir),c);
  assert.throws(()=>parseConfigText('world=C:\\Windows\\a.wld',c,defaults.saveDir),/目录/);
  assert.throws(()=>parseConfigText('garbage=1',c,defaults.saveDir),/不支持/);
  assert.throws(()=>validateInstance({...c,port:3000},3000));
  assert.throws(()=>parseConfigText(`worldname=不同名称\nworld=${defaults.saveDir}\\Worlds\\翅膀天堂.wld`,c,defaults.saveDir),/一致/);
});
test('并行实例禁止占用相同世界或端口，允许不同世界不同端口',()=>{
  const live=[{config:base,active:true}];
  assert.throws(()=>assertInstanceAvailable({...base,id:'b',world:'另一世界'},live),/端口/);
  assert.throws(()=>assertInstanceAvailable({...base,id:'b',port:7778},live),/世界/);
  assert.doesNotThrow(()=>assertInstanceAvailable({...base,id:'b',world:'另一世界',port:7778},live));
});
