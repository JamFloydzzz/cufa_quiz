const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function reply(body,status=200,type='text/plain; charset=utf-8',extra={}){
  return new Response(body,{status,headers:{...headers,'Content-Type':type,...extra}});
}
async function getEdition(db, version){
  if(version===1)return {edition:1,config:defaults};
  const row=version===undefined
    ?await db.prepare('SELECT edition,config FROM quiz_editions ORDER BY edition DESC LIMIT 1').first()
    :await db.prepare('SELECT edition,config FROM quiz_editions WHERE edition=?').bind(version).first();
  if(row)return {edition:row.edition,config:JSON.parse(row.config)};
  return version===undefined?{edition:1,config:defaults}:null;
}
function checkConfig(config){
  if(!config||typeof config.url!=='string'||config.url.length>2048)return false;
  try{const url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password)return false}catch{return false}
  if(typeof config.qr!=='string'||config.qr.length>1340000||!/^data:image\/(?:png;base64,iVBORw0KGgo|jpeg;base64,\/9j\/)[a-zA-Z0-9+/]*={0,2}$/.test(config.qr))return false;
  const text=s=>typeof s==='string'&&s.trim().length>0&&s.length<=700;
  return Array.isArray(config.questions)&&config.questions.length===30&&config.questions.every(q=>
    Array.isArray(q)&&q.length===2&&text(q[0])&&Array.isArray(q[1])&&q[1].length===4&&
    q[1].every(o=>Array.isArray(o)&&o.length===2&&Object.hasOwn(tracks,o[0])&&text(o[1]))&&new Set(q[1].map(o=>o[0])).size===4);
}
async function publish(req,db){
  if(req.headers.get('Origin')!==new URL(req.url).origin||!req.headers.get('Content-Type')?.startsWith('application/json'))return reply('',403);
  let data;try{const raw=await req.text();if(raw.length>1500000)return reply('Слишком большое изображение.',413);data=JSON.parse(raw)}catch{return reply('',400)}
  if(!Number.isSafeInteger(data?.edition)||!checkConfig(data.config))return reply('Проверь формулировки, направления, ссылку и изображение.',400);
  const version=data.edition+1;
  const result=await db.prepare(`INSERT INTO quiz_editions(edition,config) SELECT ?,?
    WHERE ?=(SELECT COALESCE(MAX(edition),1) FROM quiz_editions)`).bind(version,JSON.stringify(data.config),data.edition).run();
  if(!result.meta.changes)return reply('Квиз уже изменён в другой вкладке. Обнови страницу перед повторной публикацией.',409);
  return reply(JSON.stringify({edition:version}),200,'application/json');
}
async function submit(req,db){
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))return reply('',415);
  const body=await req.text();
  if(body.length>4096)return reply('',413);
  let data;
  try{data=JSON.parse(body)}catch{return reply('',400)}
  const {attempt,revision,choices,edition=0}=data||{};
  if(!Number.isSafeInteger(edition)||edition<0)return reply('',400);
  const snapshot=edition?await getEdition(db,edition):null;
  if(edition&&!snapshot)return reply('',400);
  const mapping=edition?snapshot.config.questions.map(q=>q[1].map(o=>o[0])):key;
  if(typeof attempt!=='string'||!/^[0-9a-f-]{36}$/.test(attempt)||!Number.isSafeInteger(revision)||revision<1||
     !Array.isArray(choices)||choices.length!==mapping.length||!choices.every(a=>a===null||(Number.isInteger(a)&&a>=0&&a<=3)))return reply('',400);
  const scores={}, answered=choices.filter(a=>a!==null).length;
  if(!answered)return reply('',400);
  choices.forEach((a,i)=>{if(a!==null){const track=mapping[i][a];scores[track]=(scores[track]||0)+1}});
  const appearances={};
  choices.forEach((a,i)=>{if(a!==null) mapping[i].forEach(k=>appearances[k]=(appearances[k]||0)+1)});
  const fraction=id=>edition?scores[id]/appearances[id]:scores[id];
  const max=Math.max(...Object.keys(scores).map(fraction));
  const leaders=Object.keys(scores).filter(id=>max-fraction(id)<=(edition?0.101:0)).sort((a,b)=>fraction(b)-fraction(a)).map(k=>edition?tracks[k]:k);
  const display=Object.fromEntries(Object.entries(scores).map(([k,v])=>edition?[tracks[k],v+'/'+appearances[k]]:[k,v]));
  await db.prepare(`INSERT INTO quiz_results(attempt,revision,answered,choices,scores,leaders,edition) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(attempt) DO UPDATE SET revision=excluded.revision,answered=excluded.answered,choices=excluded.choices,
    scores=excluded.scores,leaders=excluded.leaders,updated_at=CURRENT_TIMESTAMP WHERE excluded.revision>quiz_results.revision AND excluded.edition=quiz_results.edition`)
    .bind(attempt,revision,answered,JSON.stringify(choices),JSON.stringify(display),leaders.join(', '),edition).run();
  return reply(null,204);
}
async function report(url,req,env){
  const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1));
  const {total}=await env.DB.prepare('SELECT count(*) AS total FROM quiz_results').first();
  const {results}=await env.DB.prepare('SELECT * FROM quiz_results ORDER BY updated_at DESC,attempt LIMIT 100 OFFSET ?').bind((page-1)*100).all();
  const letters='АБВГ';
  const rows=results.map(r=>`<tr><td>${r.updated_at}</td><td>${r.answered}/${JSON.parse(r.choices).length}<br><small>Версия ${r.edition||0}</small></td><td>${r.leaders}<details><summary>Баллы и ответы</summary><p>${Object.entries(JSON.parse(r.scores)).map(([k,v])=>k+' '+v).join(' · ')}</p><p>${JSON.parse(r.choices).map((v,i)=>(i+1)+'. '+(v===null?'—':letters[v])).join(' · ')}</p></details></td></tr>`).join('');
  return reply(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Результаты CUFA</title><style>body{max-width:920px;margin:5vh auto;padding:16px;background:#fffcf5;color:#450d1a;font:17px/1.55 system-ui}h1,th{font-weight:500}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;padding:10px 5px;border-bottom:1px solid #dbcebd}summary,a{cursor:pointer;color:inherit}p{max-width:560px}</style><h1>Результаты квиза</h1><a href="/admin/edit">Редактировать вопросы и QR-код</a><p>Всего прохождений: ${total}. Время указано по UTC.</p>${total?`<table><tr><th>Время</th><th>Ответов</th><th>Ведущие направления</th></tr>${rows}</table>`:'<p>Здесь появится первое завершённое прохождение.</p>'}<p>${page>1?`<a href="?page=${page-1}">Назад</a> `:''}${total>page*100?`<a href="?page=${page+1}">Дальше</a>`:''}</p></html>`,200,'text/html; charset=utf-8');
}
export default {async fetch(req,env){
  const url=new URL(req.url);
  if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')){
  const expected=env.REPORT_PASSWORD;
  if(!expected||req.headers.get('Authorization')!=='Basic '+btoa('cufa:'+expected))
    return reply('Войдите с данными организатора.',401,undefined,{'WWW-Authenticate':'Basic realm="CUFA", charset="UTF-8"'});
    if(req.method==='GET'){
      if(url.pathname==='/admin')return report(url,req,env);
      if(url.pathname==='/admin/edit')return reply(editor,200,'text/html; charset=utf-8');
      if(url.pathname==='/admin/qr.js')return reply(qrLibrary,200,'application/javascript; charset=utf-8');
      if(url.pathname==='/admin/config')return reply(JSON.stringify({...await getEdition(env.DB),tracks}),200,'application/json');
    }
    if(req.method==='POST'&&url.pathname==='/admin/config')return publish(req,env.DB);
  }
  if(url.pathname==='/api/results'&&req.method==='POST')return submit(req,env.DB);
  if(url.pathname==='/'&&(req.method==='GET'||req.method==='HEAD')){
    const {edition,config}=await getEdition(env.DB);
    const safeJSON=JSON.stringify(config).replaceAll('<','\\u003c');
    const page=html.replace('/*PUBLIC_CONFIG*/',()=> 'const edition='+edition+', config='+safeJSON+';');
    return reply(req.method==='HEAD'?null:page,200,'text/html; charset=utf-8');
  }
  return reply('',404);
}};
