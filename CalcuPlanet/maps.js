/* NEXO: datos, migración y validación de mapas. Sin DOM ni dependencias. */
(function(root,factory){if(typeof module==='object'&&typeof require==='function')module.exports=factory();else root.NexoMaps=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const groups=['floors','walls','doors','windows','obstacles','enemies','weapons','spawns','exits','patrols'];
const rect=(x,y,width,height,extra={})=>({x,y,width,height,...extra});
function normalize(raw){
 const m=clone(raw); m.version=m.version||1;m.id=m.id||'map-'+Date.now();m.name=m.name||'Sin título';m.author=m.author||'Agente';m.width=Number(m.width)||960;m.height=Number(m.height)||540;
 for(const k of groups)m[k]=Array.isArray(m[k])?m[k]:[];
 if(raw.cover&&!m.obstacles.length)m.obstacles=clone(raw.cover);
 if(raw.exit&&!m.exits.length)m.exits=[clone(raw.exit)];
 m.cover=m.obstacles;m.exit=m.exits[0]||{x:m.width-60,y:m.height/2,radius:24};
 const used=new Set(groups.flatMap(k=>m[k].map(o=>o.id).filter(Boolean)));for(const k of groups)m[k].forEach((o,i)=>{if(!o.id){let id=k+'-'+i;while(used.has(id))id+='-n';o.id=id;used.add(id);}if(['walls','doors','windows','obstacles'].includes(k)){
  const defaults=k==='windows'?{surface:'glass',blocksMovement:true,blocksVision:false,blocksProjectiles:true,resistance:0,hp:1}:k==='obstacles'?{surface:'wood',blocksMovement:true,blocksVision:true,blocksProjectiles:true,resistance:1,hp:0}:{surface:k==='doors'?'wood':'concrete',blocksMovement:true,blocksVision:true,blocksProjectiles:true,resistance:k==='doors'?1:99,hp:0};
  for(const [p,v] of Object.entries(defaults))if(o[p]===undefined)o[p]=v;
  if(k==='doors'){o.open=!!o.open;o.direction=o.direction===-1?-1:1;o.swing=o.swing||'fixed';o.progress=o.open?1:0;}
 }});
 return m;
}
function template(id,name){return normalize({id,name,author:'NEXO',version:2,width:960,height:540,floors:[rect(18,18,924,504,{color:'#172729',label:name})],walls:[rect(0,0,960,18),rect(0,522,960,18),rect(0,0,18,540),rect(942,0,18,540)],spawns:[{x:72,y:270},{x:112,y:276}],exits:[{x:890,y:270,radius:25}],weapons:[{x:112,y:270,weapon:'shotgun',ammo:6}],enemies:[]});}
const maps=[];
let m=template('habitaciones','01 · Umbral / Habitaciones');
m.floors=[rect(18,18,260,230,{color:'#253039',label:'RECEPCIÓN'}),rect(18,306,260,216,{color:'#303025',label:'ARCHIVO'}),rect(278,18,300,230,{color:'#293433',label:'OFICINA'}),rect(278,306,300,216,{color:'#342b32',label:'DESCANSO'}),rect(578,18,364,504,{color:'#233036',label:'CONTROL'}),rect(18,248,560,58,{color:'#193b3b',label:'PASILLO'})];
m.walls.push(rect(270,18,16,190),rect(270,208,16,40),rect(270,306,16,216),rect(18,240,130,12),rect(212,240,58,12),rect(18,300,130,12),rect(212,300,58,12),rect(286,240,110,12),rect(460,240,110,12),rect(286,300,110,12),rect(460,300,110,12),rect(570,18,16,220),rect(570,312,16,210));
m.doors=[rect(148,240,64,12,{direction:-1}),rect(148,300,64,12),rect(396,240,64,12,{direction:-1}),rect(396,300,64,12),rect(570,238,16,74)];
m.windows=[rect(270,110,16,68)];m.walls=m.walls.filter(o=>!(o.x===270&&o.y===18));m.walls.push(rect(270,18,16,92),rect(270,178,16,62));
m.obstacles=[rect(76,90,95,32,{label:'Mostrador'}),rect(350,80,90,42,{label:'Escritorio'}),rect(320,400,120,30),rect(710,180,32,170)];
m.enemies=[{x:180,y:140,angle:1.57,type:'melee',weapon:'bat',behavior:'IDLE'},{x:430,y:160,angle:1.57,type:'pistol',weapon:'pistol',behavior:'PATROL',patrol:'p1'},{x:150,y:420,angle:-1.57,type:'melee',weapon:'knife'},{x:490,y:430,angle:-1.57,type:'shotgun',weapon:'shotgun'},{x:840,y:160,angle:3.14,type:'heavy',weapon:'rifle'}];m.patrols=[{id:'p1',points:[{x:340,y:170},{x:490,y:170}]}];maps.push(normalize(m));
m=template('oficinas','02 · Vidrio / Oficinas');
m.walls.push(rect(240,18,16,200),rect(240,300,16,222),rect(550,18,16,100),rect(550,192,16,190),rect(550,460,16,62),rect(256,300,140,12),rect(470,300,80,12));
m.doors=[rect(240,218,16,82),rect(550,382,16,78),rect(396,300,74,12)];m.windows=[rect(550,118,16,74)];m.obstacles=[rect(330,100,110,40),rect(330,385,110,40),rect(660,80,40,110),rect(780,340,110,40),rect(680,340,40,100)];m.enemies=[{x:380,y:220,type:'pistol',weapon:'pistol',angle:3.14},{x:430,y:460,type:'melee',weapon:'katana',angle:-1.57},{x:760,y:140,type:'pistol',weapon:'smg',angle:3.14},{x:840,y:450,type:'heavy',weapon:'rifle',angle:-1.57}];maps.push(normalize(m));
m=template('almacen','03 · Logística / Almacén');m.obstacles=[];for(let x=260;x<820;x+=160){m.obstacles.push(rect(x,80,48,140,{label:'Estantería'}),rect(x,340,48,135,{label:'Estantería'}));}m.enemies=[{x:350,y:160,type:'melee',weapon:'pipe',angle:1.57},{x:510,y:430,type:'shotgun',weapon:'shotgun',angle:-1.57},{x:690,y:270,type:'pistol',weapon:'smg',angle:3.14,behavior:'PATROL',patrol:'a1'},{x:880,y:100,type:'heavy',weapon:'rifle',angle:1.57}];m.patrols=[{id:'a1',points:[{x:660,y:270},{x:860,y:270}]}];m.weapons.push({x:180,y:350,weapon:'rifle',ammo:12});maps.push(normalize(m));
m=template('restaurante','04 · Último turno / Restaurante');m.walls.push(rect(590,18,14,180),rect(590,280,14,242),rect(604,330,180,14),rect(864,330,78,14));m.doors=[rect(590,198,14,82),rect(784,330,80,14)];m.windows=[rect(320,0,140,18,{blocksProjectiles:false})];m.walls=m.walls.filter(w=>!(w.x===0&&w.y===0&&w.width===960));m.walls.push(rect(0,0,320,18),rect(460,0,500,18));m.obstacles=[rect(140,80,160,32,{label:'Recepción'}),rect(670,70,190,35,{label:'Cocina'}),rect(670,180,120,32),rect(700,430,150,32)];for(let x=270;x<540;x+=140)for(let y=180;y<460;y+=140)m.obstacles.push(rect(x,y,52,52,{blocksVision:false,label:'Mesa'}));m.enemies=[{x:340,y:100,type:'melee',weapon:'machete',angle:1.57},{x:490,y:260,type:'pistol',weapon:'pistol',angle:3.14},{x:830,y:230,type:'shotgun',weapon:'shotgun',angle:3.14},{x:880,y:460,type:'heavy',weapon:'rifle',angle:3.14}];maps.push(normalize(m));
function doorRect(d){const t=d.progress===undefined?(d.open?1:0):d.progress;const a=(d.height>d.width?-1:1)*(d.direction||1)*Math.PI/2*t,cs=Math.cos(a),sn=Math.sin(a);const points=[[0,0],[d.width,0],[0,d.height],[d.width,d.height]].map(([x,y])=>({x:d.x+x*cs-y*sn,y:d.y+x*sn+y*cs}));const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {...d,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
function navigationBlocked(m,x,y,r=12){return blocked(m,x,y,r,true)||m.doors.filter(d=>d.open&&!d.broken&&d.blocksMovement!==false).map(doorRect).some(d=>overlap(x,y,r,d));}
function surfaces(m,rule='blocksMovement',ignoreDoors=false){return [...m.walls,...m.obstacles,...m.windows,...(ignoreDoors?[]:m.doors.map(doorRect))].filter(o=>!o.broken&&o[rule]!==false);}
function overlap(x,y,r,o){return (x-Math.max(o.x,Math.min(x,o.x+o.width)))**2+(y-Math.max(o.y,Math.min(y,o.y+o.height)))**2<r*r;}
function blocked(m,x,y,r=12,ignoreDoors=false){return x<r||y<r||x>m.width-r||y>m.height-r||surfaces(m,'blocksMovement',ignoreDoors).some(o=>overlap(x,y,r,o));}
function validate(raw){
 const errors=[];let m;try{m=normalize(raw);}catch(e){return ['JSON de mapa inválido'];}
 if(!Number.isFinite(m.width)||!Number.isFinite(m.height)||m.width<240||m.height<240||m.width>4096||m.height>4096)errors.push('Dimensiones entre 240 y 4096 píxeles.');
 if(!m.spawns.length)errors.push('Falta un punto de aparición.');if(!m.exits.length)errors.push('Falta una salida.');
 const ids=new Set();let count=0;for(const k of groups)for(const o of m[k]){count++;if(ids.has(o.id))errors.push('Identificador duplicado: '+o.id);ids.add(o.id);if(k==='patrols'){if(!Array.isArray(o.points)||!o.points.length)errors.push('Ruta vacía: '+o.id);else for(const p of o.points)if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||blocked(m,p.x,p.y,12,true))errors.push('Punto de patrulla inválido: '+o.id);continue;}if(!Number.isFinite(o.x)||!Number.isFinite(o.y))errors.push('Posición inválida: '+o.id);if(o.x<0||o.y<0||o.x+(o.width||0)>m.width||o.y+(o.height||0)>m.height)errors.push('Fuera del mapa: '+o.id);if(['floors','walls','doors','windows','obstacles'].includes(k)&&(!(o.width>0)||!(o.height>0)))errors.push('Tamaño inválido: '+o.id);}
 if(count>1800)errors.push('Límite de seguridad: 1800 elementos.');
 for(const k of ['spawns','exits','enemies','weapons'])for(const o of m[k])if(blocked(m,o.x,o.y,k==='weapons'?5:12))errors.push('Colisión en '+k+': '+o.id);
 if(errors.length||!m.spawns.length)return [...new Set(errors)];
 // Flood-fill de accesibilidad: las puertas pueden abrirse, pero sus hojas abiertas siguen ocupando espacio.
 const nav=clone(m);for(const d of nav.doors){d.open=true;d.progress=1;}const step=20,cols=Math.ceil(m.width/step),rows=Math.ceil(m.height/step);const key=(x,y)=>x+','+y;const sx=Math.floor(m.spawns[0].x/step),sy=Math.floor(m.spawns[0].y/step),q=[[sx,sy]],seen=new Set([key(sx,sy)]);
 for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){let nx=x+dx,ny=y+dy,k=key(nx,ny);if(nx<0||ny<0||nx>=cols||ny>=rows||seen.has(k)||blocked(nav,nx*step+10,ny*step+10,12))continue;seen.add(k);q.push([nx,ny]);}}
 for(const k of ['spawns','exits','enemies','weapons'])for(const p of m[k]){let reachable=false;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){let x=Math.floor(p.x/step)+dx,y=Math.floor(p.y/step)+dy;if(seen.has(key(x,y))&&Math.hypot(x*step+10-p.x,y*step+10-p.y)<36)reachable=true;}if(!reachable)errors.push('Sin ruta transitable hacia '+k+': '+p.id);}
 return [...new Set(errors)];
}
return {groups,normalize,maps,template,validate,clone,doorRect,surfaces,blocked,navigationBlocked,overlap};
});
