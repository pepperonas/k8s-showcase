// Cluster-Oberflaeche: Load Balancing, Skalieren, Self-Healing.
const $=s=>document.querySelector(s);const colors={};const pal=['#b3c5ff','#7dd99b','#ffcf70','#ff8a80','#d0bcff','#80deea'];
const col=p=>colors[p]??=pal[Object.keys(colors).length%pal.length];
async function hello(){try{const r=await fetch('api/hello').then(r=>r.json());$('#visits').textContent=r.visits;
const s=document.createElement('span');s.className='hit';s.textContent=r.pod.slice(-5);s.style.background=col(r.pod)+'33';s.style.color=col(r.pod);
$('#hits').prepend(s);while($('#hits').children.length>40)$('#hits').lastChild.remove()}catch(e){}}
$('#hello').onclick=hello;$('#burst').onclick=async()=>{for(let i=0;i<20;i++)await hello()};
let rep=0;
document.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{const n=Math.max(1,Math.min(6,rep+ +b.dataset.d));
await fetch('api/scale',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({replicas:n})});rep=n;$('#rep').textContent=n;poll()});
async function kill(name){await fetch('api/kill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});poll()}
async function poll(){try{const d=await fetch('api/pods').then(r=>r.json());const ps=d.pods;
rep=d.replicas;$('#rep').textContent=rep;
$('#pods').innerHTML=ps.map(p=>{const c=p.phase==='Terminating'?'var(--bad)':p.ready?'var(--ok)':'var(--warn)';
const st=p.phase==='Terminating'?'Terminating':p.ready?'Ready':p.phase;
return `<tr style="opacity:${p.phase==='Terminating'?.5:1}"><td><code style="color:${p.app==='api'?col(p.name):'inherit'}">${p.name}</code></td><td>${p.app}</td>
<td><span class="dot" style="background:${c}"></span>${st}</td><td>${p.restarts}</td><td>${p.ip||'–'}</td>
<td>${p.app==='api'&&p.phase!=='Terminating'?`<button class="kill" data-k="${p.name}">Kill</button>`:''}</td></tr>`}).join('');
document.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>kill(b.dataset.k))}catch(e){}}
poll();setInterval(poll,1500);
