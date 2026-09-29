import type { RequestHandler } from 'express';
export function apiGate(hosts:string[]):RequestHandler {
  const allowed=new Set(hosts.map(h=>h.toLowerCase()));
  return (req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    const hostname=req.hostname.toLowerCase();
    if(!allowed.has(hostname))return void res.status(403).json({error:'不允许的访问地址，请使用页面显示的局域网地址'});
    const origin=req.get('origin');
    if(origin && origin!==`${req.protocol}://${req.get('host')}`)return void res.status(403).json({error:'拒绝跨站请求'});
    if(!['GET','HEAD'].includes(req.method) && (req.get('x-tmod-tools')!=='1'||!req.is('application/json')))return void res.status(403).json({error:'请通过管理页面提交操作'});
    next();
  };
}
