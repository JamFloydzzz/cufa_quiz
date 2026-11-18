const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function reply(body,status=200,type='text/plain; charset=utf-8',extra={}){
  return new Response(body,{status,headers:{...headers,'Content-Type':type,...extra}});
}
async function submit(req,db){
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))return reply('',415);
  const body=await req.text();
  if(body.length>4096)return reply('',413);
  let data;
  try{data=JSON.parse(body)}catch{return reply('',400)}
  const {attempt,revision,choices}=data||{};
  if(typeof attempt!=='string'||!/^[0-9a-f-]{36}$/.test(attempt)||!Number.isSafeInteger(revision)||revision<1||
     !Array.isArray(choices)||choices.length!==key.length||!choices.every(a=>a===null||(Number.isInteger(a)&&a>=0&&a<=3)))return reply('',400);
  const scores={}, answered=choices.filter(a=>a!==null).length;
  if(!answered)return reply('',400);
  choices.forEach((a,i)=>{if(a!==null){const track=key[i][a];scores[track]=(scores[track]||0)+1}});
  const max=Math.max(...Object.values(scores));
  const leaders=Object.keys(scores).filter(id=>scores[id]===max);
  await db.prepare(`INSERT INTO quiz_results(attempt,revision,answered,choices,scores,leaders) VALUES(?,?,?,?,?,?)
    ON CONFLICT(attempt) DO UPDATE SET revision=excluded.revision,answered=excluded.answered,choices=excluded.choices,
    scores=excluded.scores,leaders=excluded.leaders,updated_at=CURRENT_TIMESTAMP WHERE excluded.revision>quiz_results.revision`)
    .bind(attempt,revision,answered,JSON.stringify(choices),JSON.stringify(scores),leaders.join(', ')).run();
  return reply(null,204);
}
async function report(url,req,env){
  const expected=env.REPORT_PASSWORD;
  if(!expected||req.headers.get('Authorization')!=='Basic '+btoa('cufa:'+expected))
    return reply('Войдите с данными организатора.',401,undefined,{'WWW-Authenticate':'Basic realm="CUFA", charset="UTF-8"'});
  const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1));
  const {total}=await env.DB.prepare('SELECT count(*) AS total FROM quiz_results').first();
  const {results}=await env.DB.prepare('SELECT * FROM quiz_results ORDER BY updated_at DESC,attempt LIMIT 100 OFFSET ?').bind((page-1)*100).all();
  const letters='АБВГ';
  const rows=results.map(r=>`<tr><td>${r.updated_at}</td><td>${r.answered}/28</td><td>${r.leaders}<details><summary>Баллы и ответы</summary><p>${Object.entries(JSON.parse(r.scores)).map(([k,v])=>k+' '+v).join(' · ')}</p><p>${JSON.parse(r.choices).map((v,i)=>(i+1)+'. '+(v===null?'—':letters[v])).join(' · ')}</p></details></td></tr>`).join('');
  return reply(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Результаты CUFA</title><style>body{max-width:920px;margin:5vh auto;padding:16px;background:#fffcf5;color:#450d1a;font:17px/1.55 system-ui}h1,th{font-weight:500}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;padding:10px 5px;border-bottom:1px solid #dbcebd}summary,a{cursor:pointer;color:inherit}p{max-width:560px}</style><h1>Результаты квиза</h1><p>Всего прохождений: ${total}. Время указано по UTC.</p>${total?`<table><tr><th>Время</th><th>Ответов</th><th>Ведущие направления</th></tr>${rows}</table>`:'<p>Здесь появится первое завершённое прохождение.</p>'}<p>${page>1?`<a href="?page=${page-1}">Назад</a> `:''}${total>page*100?`<a href="?page=${page+1}">Дальше</a>`:''}</p></html>`,200,'text/html; charset=utf-8');
}
export default {async fetch(req,env){
  const url=new URL(req.url);
  if(url.pathname==='/admin'&&req.method==='GET')return report(url,req,env);
  if(url.pathname==='/api/results'&&req.method==='POST')return submit(req,env.DB);
  if(url.pathname==='/'&&(req.method==='GET'||req.method==='HEAD'))return reply(req.method==='HEAD'?null:html,200,'text/html; charset=utf-8');
  return reply('',404);
}};
