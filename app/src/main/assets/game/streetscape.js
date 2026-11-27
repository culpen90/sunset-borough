import * as THREE from './vendor/three.module.js';
import {buildings, laneMarkings, streets} from './city.js';
import {Geometry, canvasTexture, randomFrom} from './geometry.js';
import {signalAt, signalHeads, stopLineOffset} from './traffic-lights.js';

const palettes=[
  ['#efb4a2','#4d7888','#c58578','#edd3be'], ['#b3cdc3','#426978','#709d99','#f3dec0'],
  ['#e8ce9a','#546a7c','#c09868','#fff0cd'], ['#b9b2bd','#52667e','#958597','#e1c8c4'],
  ['#e0bbad','#677f86','#bc9b92','#f1ddc1'], ['#95babd','#446276','#7099a3','#dfd4ba'],
  ['#d9a699','#635e72','#b58589','#efd9bc'], ['#d7d5bc','#476e79','#9caeaa','#e9d7ba']
];
const asphalt='#565868', paving='#e4c9a9', line='#e0b861';
const litMaterial=new THREE.MeshLambertMaterial({vertexColors:true});
const signNames=['SOLAIRE','PALM CLUB','LIDO','HOTEL AZURE','MIRAGE','CASA LUNA','LIDO RECORDS','MARINA',
  'THE PALMS','MARINA CLUB','CASA SOL','OCEANIC','CINEMA','BAR MARINO','RIVIERA','MOTEL'];
const signSubs=['OCEAN HOTEL','COCKTAIL LOUNGE','DEPARTMENT STORE','VACANCY','NIGHT CLUB','BEACH RESORT','RECORDS',
  'YACHT CLUB','APARTMENTS','LIVE MUSIC','RESTAURANT','BATHING CLUB','PICTURE HOUSE','COCKTAILS','HOTEL','AIR COOLED'];

function newCanvas(w,h) {
  const c=document.createElement('canvas'); c.width=w; c.height=h; return c;
}
function facadeTile(style) {
  const c=newCanvas(256,256), ctx=c.getContext('2d');
  const [wall,glass,shadow,edge]=palettes[style], rng=randomFrom(style+1171);
  ctx.fillStyle=wall; ctx.fillRect(0,0,256,256);
  // Two floors and four facade bays per tile, with inset sash, reflections and separate sills.
  for(let row=0;row<2;row++) for(let col=0;col<4;col++) {
    const windowWidth=[43,48,37,45,49,53,42,50][style], h=[71,69,81,74,67,79,66,77][style];
    const x=col*64+(64-windowWidth)/2,y=row*128+21;
    ctx.fillStyle=shadow;ctx.fillRect(x-2,y-3,windowWidth+4,h+10);
    ctx.fillStyle=edge;ctx.fillRect(x,y,windowWidth,h+1);
    ctx.fillStyle=glass;ctx.fillRect(x+2,y+2,windowWidth-4,h-3);
    ctx.fillStyle=rng()<.25?'#c5aa91':'#768c96';ctx.fillRect(x+3,y+3,windowWidth-6,h*(rng()*.16+.14));
    ctx.fillStyle='rgba(24,44,64,.33)';ctx.fillRect(x+3,y+h*.60,windowWidth-6,h*.38);
    ctx.fillStyle='rgba(223,226,203,.52)';ctx.fillRect(x+windowWidth*.50,y+2,2,h-3);
    ctx.fillStyle=edge;ctx.fillRect(x-3,y+h+1,windowWidth+6,3);
    if(style===2||style===5||style===7){
      ctx.fillStyle=shadow;ctx.fillRect(col*64,row*128+112,65,4);
      ctx.fillStyle=edge;ctx.fillRect(col*64,row*128+109,65,3);
    }
  }
  return new THREE.MeshLambertMaterial({map:canvasTexture(c,true),vertexColors:true});
}
function groundTile(isRoad) {
  const c=newCanvas(128,128),ctx=c.getContext('2d'),rng=randomFrom(199);
  ctx.fillStyle='#eee';ctx.fillRect(0,0,128,128);
  for(let i=0;i<(isRoad?3500:800);i++) {
    ctx.fillStyle=rng()>.52?'rgba(83,76,82,.17)':'rgba(255,255,255,.46)';
    ctx.fillRect(rng()*128,rng()*128,rng()*1.7+.4,1);
  }
  if(!isRoad) {
    ctx.fillStyle='rgba(87,79,78,.30)';ctx.fillRect(0,0,128,1);ctx.fillRect(0,64,128,1);
    ctx.fillRect(0,0,1,64);ctx.fillRect(64,64,1,64);
  }
  return new THREE.MeshLambertMaterial({map:canvasTexture(c,true),vertexColors:true});
}
function signAtlas() {
  const c=newCanvas(2048,1024),ctx=c.getContext('2d');
  for(let i=0;i<16;i++){
    const x=(i%4)*512,y=Math.floor(i/4)*128;
    const bg=['#194e56','#8a444e','#4a485a','#376b71'][i%4],ink=['#ffdcac','#ffdfaa','#f9d8bd','#ffddb0'][i%4];
    ctx.fillStyle=bg;ctx.fillRect(x,y,512,128);
    ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.strokeRect(x+7,y+7,498,114);
    ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=(i%3===0?'italic bold ':'bold ')+'62px sans-serif';
    ctx.fillText(signNames[i],x+256,y+54,462);
    ctx.font='bold 15px sans-serif';ctx.fillText(signSubs[i].split('').join(' '),x+256,y+103,420);
    ctx.fillRect(x+28,y+99,45,2);ctx.fillRect(x+439,y+99,45,2);
  }
  const words=['LIDO','PALMS','HOTEL','JAZZ','BAR','SOL','MOTEL','DISCO'];
  for(let i=0;i<16;i++){
    const x=i*128, y=512,word=words[i%8],ink=['#ffe196','#a1efdb','#ffc2ab','#f7d785'][i%4];
    ctx.fillStyle=['#385d65','#8f5a5e','#617875','#725a72'][i%4];ctx.fillRect(x,y,128,512);
    ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.strokeRect(x+7,y+7,114,498);
    ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 81px sans-serif';
    for(let j=0;j<word.length;j++)ctx.fillText(word[j],x+64,y+55+(j+.5)*398/word.length,92);
    ctx.fillRect(x+38,y+32,52,4);ctx.fillRect(x+38,y+475,52,4);
  }
  return new THREE.MeshBasicMaterial({map:canvasTexture(c),vertexColors:true});
}
function signQuad(batch,points,index) {
  batch.quad(...points,'#ffffff');
  const col=index%4, row=Math.floor(index/4);
  const u=(col+.003)/4,v=1-(row+.997)/8,u2=(col+.997)/4,v2=1-(row+.003)/8;
  batch.uvs.splice(batch.uvs.length-8,8,u,v,u2,v,u2,v2,u,v2);
}
function beam(g,a,b,width,color) {
  const up=new THREE.Vector3().fromArray(b).sub(new THREE.Vector3().fromArray(a)).normalize();
  const cross=Math.abs(up.y)>.91?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  const side=cross.cross(up).normalize().multiplyScalar(width/2);
  const depth=new THREE.Vector3().crossVectors(up,side).normalize().multiplyScalar(width/2);
  const points=p=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([s,t])=>
    [p[0]+s*side.x+t*depth.x,p[1]+s*side.y+t*depth.y,p[2]+s*side.z+t*depth.z]);
  const low=points(a),high=points(b);
  for(let k=0;k<4;k++) g.quad(low[(k+1)%4],low[k],high[k],high[(k+1)%4],color);
}
function palmGeometry(seed) {
  const tree=new Geometry(),rng=randomFrom(seed),height=8.8+rng()*1.8;
  const ring=(level,radius)=>Array.from({length:7},(_,i)=>{
    const t=-i*2*Math.PI/7, f=level/height;
    return [.7*f*f+Math.cos(t)*radius,level,Math.sin(t)*radius-.3*f*f];
  });
  for(let i=0;i<14;i++){
    const y=i*height/14,r=.16+.085*(1-i/14);
    tree.rings(ring(y,r+.035),ring(y+height/14,r),i%3?'#786c58':'#91816a');
  }
  for(let f=0;f<13;f++){
    const a=f/13*Math.PI*2+rng()*.23,len=2.5+rng()*1.8,crest=.9+rng()*.94;
    const endDrop=f%3===0?-.75:1.0+rng();
    const p=(t,side=0,drop=0)=>[.7+Math.cos(a)*len*t-Math.sin(a)*side,
      height+Math.sin(t*Math.PI)*crest-endDrop*t*t-drop,-.3+Math.sin(a)*len*t+Math.cos(a)*side];
    const leafColors=['#49745c','#52825e','#466f5e','#658561','#3d6d59'];
    const tint=leafColors[f%5],under=leafColors[(f+2)%5];
    for(let k=0;k<7;k++){
      const t=k/7,n=(k+1)/7,breadth=.48*Math.sin((t*.88+.06)*Math.PI);
      const root=p(t),tip=p(Math.min(n+.055,1)),l=p(n,breadth,.16+breadth*.34),r=p(n,-breadth,.16+breadth*.34);
      tree.quad(root,l,tip,root,tint);
      tree.quad(root,tip,r,root,under);

    }
  }
  return tree.mesh(litMaterial).geometry;
}
function lamp(g,x,z,dx,dz) {
  const metal='#566467', y=6.7;
  g.box(x,.47,z,.35,.8,.35,'#646b68');
  g.box(x,3.48,z,.135,6.13,.135,metal);
  beam(g,[x,6.34,z],[x+dx*.8,y,z+dz*.8],.12,metal);
  g.box(x+dx*1.55,y,z+dz*1.55,dx?1.54:.14,.11,dz?1.54:.14,metal);
  g.box(x+dx*2.39,y-.02,z+dz*2.39,dx?.83:.49,.16,dz?.83:.49,'#536064');
  g.box(x+dx*2.39,y-.12,z+dz*2.39,dx?.65:.34,.06,dz?.65:.34,'#ffdda6');
}

function buildingScenery(b,index,chunk) {
  const {x,z,w,d,h,style}=b, pal=palettes[style],g=chunk.solid;
  const base=3.12,mainH=Math.max(4.2,h-.42);
  const big=h>=22,sideSet=big?(h>39?2.25:1.5):0;
  const groundBottom=.13;
  g.box(x,1.65,z,w,base,d,pal[2]);
  const facadePoints=(midX,midZ,width,depth,y)=>[[midX-width/2,y,midZ+depth/2],[midX+width/2,y,midZ+depth/2],
    [midX+width/2,y,midZ-depth/2],[midX-width/2,y,midZ-depth/2]];
  const shell=(width,depth,low,high)=>{
    const a=facadePoints(x,z,width,depth,low),c=facadePoints(x,z,width,depth,high);
    const facade=chunk.faces[style];
    for(let i=0;i<4;i++) {
      const j=(i+1)%4;
      facade.quad(a[i],a[j],c[j],c[i],'#ffffff',Math.max(1,Math.round((i%2?depth:width)/11)),Math.max(.5,Math.round((high-low)/3.4)/2));
    }
    g.quad(c[0],c[1],c[2],c[3],pal[2]);
  };
  const shoulder=big?Math.floor(mainH*.64):mainH;
  shell(w,d,base,shoulder);
  g.box(x,shoulder+.04,z,w+.42,.28,d+.42,pal[3]);
  if(big) {
    shell(w-sideSet*2,d-sideSet*2,shoulder+.16,mainH);
    g.box(x,mainH+.06,z,w-sideSet*2+.52,.37,d-sideSet*2+.52,pal[3]);
    if(h>38) {
      const crown=3+(index%4)*1.1;
      g.box(x,mainH+crown/2,z,w*.51,crown,d*.54,pal[0]);
      for(let j=0;j<3;j++) g.box(x,mainH+crown*.35+j*.60,z,w*.51+.3,.13,d*.54+.3,pal[3]);
      if(index%2===0) g.box(x,mainH+crown+2.3,z,.13,4.6,.13,pal[2]);
    }
  }
  g.box(x,base+.05,z,w+.58,.32,d+.58,pal[3]);
  // Ground-floor shops face all adjoining streets, with setbacks and striped awnings.
  const xSide=Math.sign(Math.round(x/80)*80-x)||1,zSide=Math.sign(Math.round(z/80)*80-z)||1;
  for(let axis=0;axis<2;axis++){
    const face=axis?xSide:zSide,length=axis?d:w,depth=axis?w:d;
    const at=(u,y,offset)=>axis?[x+face*(depth/2+offset),y,z-face*u]:[x+face*u,y,z+face*(depth/2+offset)];
    const box=(u,y,offset,width,height,thick,color)=>{
      const p=at(u,y,offset);g.box(...p,axis?thick:width,height,axis?width:thick,color);
    };
    const count=Math.max(2,Math.round(length/3.05));
    for(let j=0;j<count;j++){
      const u=(j+.5)*length/count-length/2;
      box(u,(groundBottom+2.29)/2,.018,length/count-.29,2.15,.06,'#41636b');
      box(u,.44,.059,length/count-.34,.24,.06,'#62858a');
      box(u,1.74,.064,length/count-.34,.047,.07,pal[3]);
      if((j+style)%3===0) {
        box(u+.19,1.03,.073,length/count*.33,.39,.03,['#a28477','#94a392','#c3a27d'][j%3]);
        box(u+.20,1.30,.071,length/count*.23,.14,.034,pal[1]);
      }
    }
    const awning=['#c76958','#669594','#b58a61','#987180','#748c89','#6c9d9e','#b86f74','#7e9686'][style];
    box(0,2.72,.44,length-.65,.17,1.18,awning);
    box(0,2.62,1.01,length-.66,.18,.11,pal[3]);
    if(style%3!==0){
      const strips=Math.floor(length/.93);
      for(let j=0;j<strips;j+=2)box((j+.5-strips/2)*.93,2.64,1.073,.88,.17,.028,awning);
    }
    // Each shop sign faces the street, with correct winding and type orientation.
    const signWidth=Math.min(length*.77,10),signY=big?4.55:4.16,off=.13,sh=signWidth*.21;
    if(axis===index%2 || Math.abs(x)<55&&Math.abs(z)<55){
      box(0,signY,off,signWidth+.22,sh+.20,.29,pal[3]);
      signQuad(chunk.signs,[at(-signWidth/2,signY-sh/2,off+.17),at(signWidth/2,signY-sh/2,off+.17),
        at(signWidth/2,signY+sh/2,off+.17),at(-signWidth/2,signY+sh/2,off+.17)],x===27&&z===-53?6:(index+axis*7)%16);
    }
  }
  // Double-sided enamel blade signs belong to the central boulevard's hotels and venues.
  const boulevard=Math.abs(x)<33 && Math.abs(z)<207;
  if(boulevard || index%9===0){
    const word=x===27&&z===-27?1:x===27&&z===-53?0:index%8;
    const px=x+xSide*(w/2+.91),pz=z+zSide*(d/2-2.4);
    const tall=Math.min(9.8,h*.75), bottom=3.85,wide=tall*.238;
    g.box(px,bottom+tall/2,pz,wide+.12,tall+.20,.41,pal[2]);
    for(const face of [-1,1]){
      const at=(u,y)=>[px+face*u,y,pz+face*.216];
      chunk.signs.quad(at(-wide/2,bottom),at(wide/2,bottom),at(wide/2,bottom+tall),at(-wide/2,bottom+tall),'#ffffff');
      const u=(word+.007)/16,u2=(word+.993)/16;
      chunk.signs.uvs.splice(chunk.signs.uvs.length-8,8,u,.003,u2,.003,u2,.497,u,.497);
    }
    for(const level of [.16,.82])g.box(px-xSide*.89,bottom+tall*level,pz,1.95,.17,.17,'#6d7d78');
  }
  // Continuous deck ledges and occasional balconies distinguish courthouses, apartments and hotels.
  if(style===7 || style===2 || style===4){
    for(let y=6.13;y<shoulder-1.5;y+=style===7?3.45:6.85) {
      g.box(x,y,z,w+.62,.18,d+.62,pal[3]);
      if(style===7 || style===4){
        for(const face of [-1,1]){
          const bx=x+face*(w*.5+.49),span=d*(style===7?.63:.45);
          g.box(bx,y,z,.98,.23,span,pal[2]);
          g.box(bx+face*.45,y+.41,z,.09,.64,span,pal[3]);
          g.box(bx+face*.47,y+.77,z,.11,.075,span+.12,pal[1]);
        }
      }
    }
  }
  // Per-building roof profiles break up the street silhouette.
  if(!big || index%2) {
    const a=Math.min(d,w)*.21;
    g.box(x+w*.20,mainH+.76,z-d*.17,a,1.38,a*.85,'#9c9b96');
    g.box(x+w*.20,mainH+1.48,z-d*.17,a+.15,.16,a*.85+.15,'#c4b9a4');
  }
  if(style===1 || style===6) {
    const s=zSide;
    for(let n=-1;n<=1;n++) g.box(x+n*.59,shoulder*.60,z+s*d/2,.26,shoulder*.92,.64,pal[3]);
  }
}

function buildTrafficLights(scene,chunkAt) {
  const lenses = new THREE.InstancedMesh(new THREE.CircleGeometry(.29, 16),
    new THREE.MeshBasicMaterial({color:0xffffff}), signalHeads.length * 3);
  const lensPose = new THREE.Object3D();
  const aspects = ['stop','yield','go'];
  const lit = ['#ff453f','#ffcc32','#38ff8e'].map(color => new THREE.Color(color));
  const dark = ['#4a292a','#493d28','#23473b'].map(color => new THREE.Color(color));
  signalHeads.forEach(({x,z,yaw}, headIndex) => {
    const g = chunkAt(x,z).solid, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const box = (across,y,depth,w,h,d,color) =>
      g.box(x + cs*across + sn*depth,y,z - sn*across + cs*depth,w,h,d,color,yaw);
    box(6,.49,0,.46,.70,.46,'#939387');
    box(6,3.65,0,.23,6.8,.23,'#586565');
    box(2.86,6.93,0,6.47,.17,.18,'#586565');
    box(0,5.88,0,.87,2.10,.49,'#cfa05a');
    box(0,5.88,.25,.77,1.99,.07,'#28323a');
    for (let i=0; i<3; i++) {
      const y = 6.52 - i*.64;
      box(0,y+.30,.40,.68,.07,.32,'#414e50');
      lensPose.position.set(x + sn*.29,y,z + cs*.29);
      lensPose.rotation.y = yaw;
      lensPose.updateMatrix();
      lenses.setMatrixAt(headIndex*3+i,lensPose.matrix);
    }
  });
  lenses.computeBoundingSphere();
  scene.add(lenses);
  const lastAspect = [];
  return time => {
    let changed = false;
    signalHeads.forEach(({junction,axis}, index) => {
      const aspect = signalAt(junction.x,junction.z,axis,time);
      if (lastAspect[index] === aspect) return;
      lastAspect[index] = aspect;
      for (let i=0; i<3; i++) {
        lenses.setColorAt(index*3+i,aspects[i] === aspect ? lit[i] : dark[i]);
      }
      changed = true;
    });
    if (changed) lenses.instanceColor.needsUpdate = true;
  };
}

// Bake the fixed sunset into one small ground shadow texture shared by curbs, asphalt and paint.
function streetShadowMap(chunks) {
  const c=newCanvas(2048,2048),ctx=c.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);
  ctx.setTransform(4,0,0,4,1024,1024);
  ctx.fillStyle='#d6d6d6';
  for(const b of buildings){
    const l=b.x-b.w/2,r=b.x+b.w/2,n=b.z-b.d/2,s=b.z+b.d/2;
    const dx=b.h*.59,dz=b.h*.40;
    ctx.beginPath();ctx.moveTo(l,n);ctx.lineTo(r,n);ctx.lineTo(r+dx,n+dz);
    ctx.lineTo(r+dx,s+dz);ctx.lineTo(l+dx,s+dz);ctx.lineTo(l,s);ctx.closePath();ctx.fill();
  }
  for(const ch of chunks.values())for(const [x,z,rot,size] of ch.trees) {
    const tx=x+6.1*size,tz=z+4.1*size;
    ctx.strokeStyle='#a5a5a5';ctx.lineWidth=.29;ctx.beginPath();ctx.moveTo(x,z);ctx.lineTo(tx,tz);ctx.stroke();
    ctx.fillStyle='#909090';
    for(let j=0;j<12;j++) {
      const a=rot+j*Math.PI/6,dx=Math.cos(a)*size,dz=Math.sin(a)*size;
      ctx.beginPath();ctx.moveTo(tx,tz);
      ctx.quadraticCurveTo(tx+dx*2.2-dz*.40,tz+dz*2.2+dx*.40,tx+dx*3.4-.7,tz+dz*3.4-.5);
      ctx.quadraticCurveTo(tx+dx*1.9+dz*.17,tz+dz*1.9-dx*.17,tx,tz);ctx.fill();
    }
  }
  return new THREE.CanvasTexture(c);
}

function receiveStreetShadows(material,texture) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.streetShadows={value:texture};
    shader.vertexShader='varying vec2 shadowCoord;\n'+shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nshadowCoord=vec2(position.x+256.0,256.0-position.z)/512.0;');
    shader.fragmentShader='varying vec2 shadowCoord; uniform sampler2D streetShadows;\n'+shader.fragmentShader
      .replace('#include <opaque_fragment>', 'outgoingLight*=mix(vec3(1.0),vec3(.49,.59,.72),texture2D(streetShadows,shadowCoord).r);\n#include <opaque_fragment>');
  };
  return material;
}

function roadFurniture(scene,chunkAt,chunks) {
  const markings=new Geometry(),road=new Geometry(),walks=new Geometry();
  road.floor(0,0,511,511,asphalt,-.016,143,143);
  for(let i=0;i<6;i++) for(let j=0;j<6;j++) {
    const x=streets[i]+40,z=streets[j]+40;
    const g=chunkAt(x,z).solid;
    g.box(x,.06,z,60,.14,60,'#c2ac98');
    walks.floor(x,z,59.75,59.75,paving,.139,16,16);
  }
  for(const s of [-1,1]) {
    walks.floor(0,s*253,510,6,paving,.139,133,1.5);
    walks.floor(s*253,0,6,510,paving,.139,1.5,133);
  }
  for(let streetIndex=0;streetIndex<7;streetIndex++){
    const cross=streets[streetIndex];
    for(let i=0;i<6;i++) for(let axis=0;axis<2;axis++) {
      const start=streets[i],mid=start+40;
      const xy=(along,across)=>axis?[cross+across,along]:[along,cross+across];
      const stripe=(along,across,len,width,color,height=.012)=>{
        const [x,z]=xy(along,across);markings.floor(x,z,axis?width:len,axis?len:width,color,height);
      };
      for(const s of [-1,1]){
        stripe(mid,s*laneMarkings.yellow,50,.12,line);
        stripe(mid,s*laneMarkings.shoulder,50,.11,'#d8d1bc');
        for(let n=-2;n<=2;n++) stripe(mid+n*10,s*laneMarkings.divider,3.25,.115,'#e5d8be');
        for(let n=-5;n<=5;n++){
          const off=n*1.56;
          stripe(mid+s*28.1,off,2.55,.61,'#e2d4bb');
        }
        stripe(mid+s*(40-stopLineOffset),(axis ? -s : s)*4.75,.29,8.6,'#e2d4bb');
        const [tx,tz]=xy(mid+(s>0?9:-8),s*12.2);
        chunkAt(tx,tz).trees.push([tx,tz,(i+streetIndex+axis)*.74+s,.78+((i*9+axis*3+streetIndex)%5)*.10]);
        if((i+streetIndex+axis)%2===0 || cross===0) {
          const [px,pz]=xy(mid+(s>0?-13:14),s*12.45);
          chunkAt(px,pz).trees.push([px,pz,(i+streetIndex)*1.2+s,.88+(i%3)*.12]);
        }
        const [lx,lz]=xy(mid+s*17.9,s*10.8);
        lamp(chunkAt(lx,lz).solid,lx,lz,axis?-s:0,axis?0:-s);
        const [dx,dz]=xy(mid+s*17.5,s*9.68);
        const furn=chunkAt(dx,dz).solid;
        for(let k=0;k<5;k++){
          if(axis) furn.floor(dx,dz+k*.1-.2,.39,.052,'#384957',.01);
          else furn.floor(dx+k*.1-.2,dz,.052,.39,'#384957',.01);
        }
      }
    }
  }
  const shadow=streetShadowMap(chunks);
  scene.add(road.mesh(receiveStreetShadows(groundTile(true),shadow)),
    walks.mesh(receiveStreetShadows(groundTile(false),shadow)),
    markings.mesh(receiveStreetShadows(litMaterial.clone(),shadow)));
}

function horizon(scene) {
  const g=new Geometry(),rng=randomFrom(891),water=new Geometry();
  water.floor(0,0,3500,3500,'#829fa1',-1.3);
  for(let i=0;i<1550;i++){
    const x=rng()*1500-750,z=rng()*1500-750;
    if(Math.abs(x)<257 && Math.abs(z)<257)continue;
    water.floor(x,z,1+rng()*13,.09+rng()*.38,rng()>.65?'#cfb4a2':'#9ab3ae',-1.26);
  }
  scene.add(water.mesh(new THREE.MeshBasicMaterial({vertexColors:true})));
  for(const s of [-1,1]) {
    g.box(s*255.9,-.48,0,1.7,1.8,513,'#aa9b88');
    g.box(0,-.48,s*255.9,513,1.8,1.7,'#aa9b88');
    g.box(s*255.45,.43,0,.48,.26,511,'#e3ccb0');
    g.box(0,.43,s*255.45,511,.26,.48,'#e3ccb0');
  }
  for(let i=0;i<162;i++){
    const t=i/162*Math.PI*2;
    const radius=450+rng()*165;
    const x=Math.sin(t)*radius,z=Math.cos(t)*radius;
    const w=6+rng()*17,d=6+rng()*18,h=9+rng()*39+(1+Math.sin(t*5))*9;
    const color=['#918e9e','#aa9ca5','#a79c9c','#8e91a2'][i%4];
    g.box(x,h*.5-2,z,w,h,d,color);
    if(i%3===0){
      g.box(x,h+.07,z,w*.62,5.2,d*.70,color);
      g.box(x,h+4.7,z,.24,4,.24,color);
    }
    g.box(x,-1.18,z,w+13,1.8,d+12,'#9f9b99');
  }
  scene.add(g.mesh(litMaterial));
}
export function buildStreets(scene) {
  const facades=palettes.map((_,i)=>facadeTile(i)), signMaterial=signAtlas();
  const chunks=new Map(),palms=[palmGeometry(91),palmGeometry(287)];
  const chunkAt=(x,z)=>{
    const key=Math.floor((x+260)/130)+','+Math.floor((z+260)/130);
    if(!chunks.has(key)) chunks.set(key,{solid:new Geometry(),faces:facades.map(()=>new Geometry()),signs:new Geometry(),trees:[]});
    return chunks.get(key);
  };
  roadFurniture(scene,chunkAt,chunks);
  const updateLights = buildTrafficLights(scene,chunkAt);
  buildings.forEach((b,i)=>buildingScenery(b,i,chunkAt(b.x,b.z)));
  const dummy=new THREE.Object3D();
  const palmMaterial=litMaterial.clone();palmMaterial.side=THREE.DoubleSide;
  for(const chunk of chunks.values()) {
    scene.add(chunk.solid.mesh(litMaterial));
    for(let i=0;i<facades.length;i++) if(chunk.faces[i].indices.length)scene.add(chunk.faces[i].mesh(facades[i]));
    if(chunk.signs.indices.length)scene.add(chunk.signs.mesh(signMaterial));
    for(let variant=0;variant<2;variant++){
      const coords=chunk.trees.filter((_,i)=>i%2===variant);
      if(!coords.length)continue;
      const group=new THREE.InstancedMesh(palms[variant],palmMaterial,coords.length);
      coords.forEach(([x,z,angle,scale],i)=>{
        dummy.position.set(x,.13,z);dummy.rotation.y=angle;dummy.scale.setScalar(scale);dummy.updateMatrix();
        group.setMatrixAt(i,dummy.matrix);
      });
      group.computeBoundingSphere();scene.add(group);
    }
  }
  horizon(scene);
  return updateLights;
}
