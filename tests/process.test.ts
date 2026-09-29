import test from 'node:test';
import assert from 'node:assert/strict';
import { ManagedServer } from '../server/process.ts';
import { once } from 'node:events';

test('进程真实退出前保持运行状态，拒绝重复启动，正常退出发送 exit', async () => {
  const server = new ManagedServer(()=>{});
  const child = server.launch(process.execPath,['-e',"process.stdout.write('ready\\n');process.stdin.on('data',b=>{if(b.toString().trim()==='exit')process.exit(0)})"],process.cwd(),'测试');
  await once(child.stdout!, 'data');
  assert.throws(()=>server.launch(process.execPath,[],process.cwd(),'测试'), /运行|启动/);
  server.stop();
  assert.equal(server.status.state, 'stopping');
  await once(child,'close');
  assert.equal(server.status.state,'stopped');
});
test('异常退出不能报告为正常关闭', async()=>{
  const server = new ManagedServer(()=>{});
  const child = server.launch(process.execPath,['-e','process.exit(2)'],process.cwd(),'测试');
  await once(child,'close');
  assert.equal(server.status.state,'error');
});
