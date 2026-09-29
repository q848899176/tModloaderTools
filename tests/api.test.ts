import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { apiGate } from '../server/security.ts';
test('拒绝外部来源及无意的表单写入，允许同源 JSON 操作',async()=>{
  const app=express();app.use(apiGate(['127.0.0.1']));app.post('/test',(_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}/test`;
  try {
    assert.equal((await fetch(url,{method:'POST',headers:{origin:'https://evil.test','x-tmod-tools':'1','content-type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(url,{method:'POST',body:'x=1'})).status,403);
    assert.equal((await fetch(url,{method:'POST',headers:{origin:new URL(url).origin,'x-tmod-tools':'1','content-type':'application/json'},body:'{}'})).status,200);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
