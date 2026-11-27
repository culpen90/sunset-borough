import * as THREE from './vendor/three.module.js';
import { Geometry } from './geometry.js';

const solid = new THREE.MeshLambertMaterial({vertexColors:true});
const chrome = '#c3ced0', tire = '#1a1c2b', trim = '#202839', glass = '#244452';
const carModels = new Map();

function outline(y, width, front, back, bevel = .18, x = 0, z = 0) {
  const w=width/2, end=Math.min(bevel,w*.45,(back-front)*.24);
  return [[-w+end,y,back],[w-end,y,back],[w,y,back-end],[w,y,front+end],
    [w-end,y,front],[-w+end,y,front],[-w,y,front+end],[-w,y,back-end]]
    .map(p=>[p[0]+x,p[1],p[2]+z]);
}

function closedLoft(g, levels, color) {
  for (let i=1;i<levels.length;i++) g.rings(levels[i-1],levels[i],color);
  const ring=levels[levels.length-1];
  const center = ring.reduce((a,p)=>[a[0]+p[0]/ring.length,p[1],a[2]+p[2]/ring.length],[0,0,0]);
  for (let i=1;i<ring.length;i+=2) {
    g.quad(center,ring[i-1],ring[i],ring[(i+1)%ring.length],color);
  }
}

function wheel(g,x,z,side) {
  const centerY=.43, outerX=x+side*.14, hubX=outerX+side*.014;
  const circle = (atX,radius) => Array.from({length:12},(_,i)=>{
    const t=i*Math.PI/6*side;
    return [atX,centerY+Math.cos(t)*radius,z+Math.sin(t)*radius];
  });
  const outer=circle(outerX,.405), inner=circle(x-side*.15,.405), hub=circle(hubX,.215);
  for(let i=0;i<12;i++) {
    const j=(i+1)%12;
    g.quad(outer[i],inner[i],inner[j],outer[j],tire);
    g.quad(outer[i],outer[j],hub[j],hub[i],'#242733');
    g.quad([hubX,centerY,z],hub[i],hub[j],[hubX,centerY,z],i%2===0?chrome:'#687889');
  }
}

export function carModel(car) {
  const key = car.type+'/'+car.color;
  if (carModels.has(key)) return new THREE.Mesh(carModels.get(key),solid);
  const g=new Geometry();
  const coupe=car.type==='coupe', police=car.type==='police', taxi=car.type==='taxi';
  const paint=new THREE.Color(police?'#28394e':taxi?'#eeb44c':car.color ?? '#de7660');
  const shadowPaint=paint.clone().multiplyScalar(.72), hoodPaint=paint.clone().lerp(new THREE.Color('#ffffff'),.075);
  const front=coupe?-2.42:-2.55, back=coupe?2.21:2.49, width=coupe?2.10:2.05;
  const deck=coupe?.99:1.08, top=coupe?1.59:1.79;
  closedLoft(g,[outline(.29,width-.22,front+.12,back-.07),outline(.47,width+.04,front,back),
    outline(.84,width,front+.04,back-.02),outline(deck,width-.18,front+.13,back-.12)],paint);
  g.box(0,.48,front-.011,width-.34,.13,.12,trim);
  g.box(0,.48,back+.012,width-.25,.14,.13,trim);
  g.box(0,.52,front-.083,.57,.16,.018,'#dcd2aa');
  g.box(0,.68,front-.015,.78,.11,.09,'#212d35');
  for(const side of [-1,1]){
    g.box(.70*side,.695,front+.004,.40,.15,.10,'#fff4cf');
    g.box(.93*side,.70,front+.064,.095,.115,.10,'#ffad44');
    g.box(side*(width*.5-.006),.60,.025,.05,.068,4.00,trim);
    g.box(side*(width*.5+.09),1.03,-.59,.22,.13,.25,shadowPaint);
    g.box(side*(width*.5-.021),.89,.36,.044,.042,.20,chrome);
    if(police) g.box(side*(width*.5-.014),.82,.05,.044,.37,1.52,'#e5e5d4');
    wheel(g,side*(width/2-.12),front+1.02,side);
    wheel(g,side*(width/2-.12),back-.91,side);
  }
  const lowerFront=coupe?-1.07:-1.28, lowerBack=coupe?1.20:1.52;
  const upperFront=coupe?-.43:-.83, upperBack=coupe?.61:1.06;
  const lower=outline(deck,width-.25,lowerFront,lowerBack,.12);
  const upper=outline(top,width-.54,upperFront,upperBack,.085);
  g.rings(lower,upper,glass);
  closedLoft(g,[upper,outline(top+.05,width-.58,upperFront+.04,upperBack-.03,.07)],hoodPaint);
  // Slender pillars and reflections give the windshield a dark uninterrupted face.
  for (const side of [-1,1]) {
    const xl=side*(width-.25)/2, xu=side*(width-.54)/2;
    const strip=(zl,zu,span,color)=>g.quad([xl,deck,zl],[xl,deck,zl+span],[xu,top,zu+span],[xu,top,zu],color);
    if(side<0) {
      strip(lowerFront+.12,upperFront+.08,.08,paint);
      strip(.21,.20,.065,trim);
    } else {
      strip(lowerFront+.20,upperFront+.16,-.08,paint);
      strip(.27,.26,-.065,trim);
    }
  }
  if(coupe) {
    // Rear window louvers run across the fastback. The tail panel is a continuous red strip.
    for(let n=0;n<5;n++){
      const t=.10+n*.165;
      g.box(0,top-(top-deck)*t+.023,upperBack+(lowerBack-upperBack)*t,
        width-.68+t*.12,.042,.105,'#1f303a');
    }
    g.box(0,deck+.069,back-.28,width-.08,.075,.23,shadowPaint);
  }
  g.box(0,.759,back-.022,width-.28,.22,.12,'#3c2734');
  g.box(0,.796,back+.045,width-.40,.091,.025,'#ff4549');
  for(const side of [-1,1]) {
    g.box(side*(width*.5-.33),.705,back+.047,.27,.045,.024,'#ffa26a');
    g.box(side*(width*.5-.46),.42,back+.085,.19,.083,.12,'#676c77');
  }
  g.box(0,.606,back+.072,.47,.153,.023,'#e2d8bb');
  g.box(0,.606,back+.087,.27,.027,.013,'#48606b');
  if(taxi) {
    g.box(0,top+.19,.08,.74,.24,.4,'#f6df9a');
    g.box(0,top+.19,.287,.40,.038,.014,trim);
  }
  if(police) {
    g.box(0,top+.11,.06,1.16,.12,.31,trim);
    g.box(-.30,top+.19,.06,.52,.14,.28,'#fc485a');
    g.box(.30,top+.19,.06,.52,.14,.28,'#559bff');
  }
  const mesh=g.mesh(solid);
  carModels.set(key,mesh.geometry);
  return mesh;
}

const skins=['#a56446','#e1a279','#794c3b','#bd805e'];
const tops=['#f7b87c','#72b3af','#d07e91','#688ab3','#deb156','#b4ada4'];
const pants=['#283746','#47576a','#394048'];
const pedModels = new Map();

function makePersonParts(index,hero){
  const skin=hero?'#b97850':skins[index%skins.length];
  const jacket=hero?'#cc4d3d':tops[index%tops.length], denim=hero?'#28405a':pants[index%pants.length];
  const torso=new Geometry(), hair=hero?'#2b2024':['#342927','#54382c','#272631'][index%3];
  closedLoft(torso,[outline(.86,.47,-.155,.16,.07),outline(1.06,.57,-.185,.185,.09),
    outline(1.40,.66,-.18,.18,.09),outline(1.46,.45,-.14,.14,.07)],jacket);
  torso.box(0,.91,.005,.47,.105,.29,hero?'#793d37':denim);
  torso.box(0,1.46,0,.175,.18,.185,skin);
  closedLoft(torso,[outline(1.50,.25,-.14,.09,.058),outline(1.59,.32,-.17,.14,.069),
    outline(1.80,.33,-.145,.16,.06),outline(1.835,.25,-.11,.13,.062)],skin);
  closedLoft(torso,[outline(1.735,.347,-.147,.172,.053),outline(1.823,.36,-.155,.163,.06),
    outline(1.89,.283,-.133,.127,.056)],hair);
  torso.box(0,1.718,.143,.265,.151,.055,hair);
  torso.box(-.084,1.69,-.164,.054,.021,.023,'#46322f');
  torso.box(.084,1.69,-.164,.054,.021,.023,'#46322f');
  if(hero){
    torso.box(0,1.39,-.11,.25,.105,.15,'#f4d9ac');
    torso.box(0,1.18,-.179,.023,.32,.018,'#e2ac72');
    // The back of the custom bomber has a two-tone racing chevron.
    const badge = (y,s,color) => {
      for(const side of [-1,1]) {
        const outer=side*.18*s;
        torso.quad([0,y,.193],[outer,y+.10*s,.193],[outer,y+.15*s,.193],[0,y+.05*s,.193],color);
        torso.quad([0,y+.05*s,.194],[outer,y+.15*s,.194],[outer,y+.10*s,.194],[0,y,.194],color);
      }
    };
    badge(1.16,1,'#f6deaa'); badge(1.13,.63,'#f6deaa');
    torso.box(0,1.423,.135,.31,.061,.095,'#773f3a');
  }
  const arm=new Geometry(),leg=new Geometry();
  closedLoft(arm,[outline(-.38,.152,-.082,.078,.036),outline(-.10,.21,-.11,.105,.042),outline(.025,.184,-.095,.095,.046)],jacket);
  arm.box(0,-.385,-.008,.156,.072,.148,hero?'#e8c69a':jacket);
  arm.box(0,-.456,-.02,.135,.13,.13,skin);
  closedLoft(leg,[outline(-.74,.149,-.075,.085,.03),outline(-.36,.208,-.11,.108,.03),outline(.035,.228,-.13,.13,.04)],denim);
  leg.box(0,-.787,-.048,.19,.124,.323,'#e8decb');
  leg.box(0,-.827,-.05,.194,.048,.33,'#565b65');
  return [torso.mesh(solid).geometry,arm.mesh(solid).geometry,leg.mesh(solid).geometry];
}

export function personModel(index,hero=false){
  const key=hero?'hero':index%12;
  if(!pedModels.has(key)) pedModels.set(key,makePersonParts(index,hero));
  const [torso,arm,leg]=pedModels.get(key), root=new THREE.Group();
  root.add(new THREE.Mesh(torso,solid));
  const limbs=[];
  for(const side of [-1,1]){
    const a=new THREE.Mesh(arm,solid),l=new THREE.Mesh(leg,solid);
    a.position.set(side*.334,1.382,.012); a.rotation.z=side*.071;
    l.position.set(side*.126,.852,.005);
    root.add(a,l); limbs.push(a,l);
  }
  root.userData.limbs=limbs;
  return root;
}
