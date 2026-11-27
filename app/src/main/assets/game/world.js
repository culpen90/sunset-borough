import * as THREE from './vendor/three.module.js';
import {buildStreets} from './streetscape.js';
import {carModel,personModel} from './models.js';
import {buildings,streetAt} from './city.js';
import {randomFrom} from './geometry.js';

const clamp=THREE.MathUtils.clamp;
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const sidewalkHeight=(x,z)=>Math.abs(x-streetAt(x))>10 && Math.abs(z-streetAt(z))>10 ? .14 : 0;

function sunset() {
  const c=document.createElement('canvas');c.width=1024;c.height=256;
  const ctx=c.getContext('2d'),rng=randomFrom(641);
  ctx.fillStyle='#000000';ctx.fillRect(0,0,1024,256);
  for(let i=0;i<105;i++){
    const x=rng()*1024,y=118+rng()*116,w=4+rng()**2*89,h=.28+rng()**2*3;
    const bright=32+Math.floor(rng()*95);
    ctx.fillStyle='rgb('+bright+','+bright+','+bright+')';
    for(const offset of [-1024,0,1024]){
      const px=x+offset;ctx.beginPath();ctx.moveTo(px-w,y);
      ctx.bezierCurveTo(px-w*.55,y-h*.35,px-w*.18,y-h*1.35,px+w*.10,y-h*.71);
      ctx.bezierCurveTo(px+w*.43,y-h*.85,px+w*.51,y+h*.16,px+w,y+h*.10);
      ctx.bezierCurveTo(px+w*.30,y+h*.80,px-w*.32,y+h*.36,px-w,y);ctx.fill();
    }
  }
  const tex=new THREE.CanvasTexture(c);tex.wrapS=THREE.RepeatWrapping;
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,depthTest:false, uniforms:{clouds:{value:tex}},
    vertexShader:`varying vec3 skyDir;
    void main(){skyDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision mediump float;
    varying vec3 skyDir; uniform sampler2D clouds;
    void main(){
      vec3 ray=normalize(skyDir);
      float h=ray.y;
      vec3 horizon=vec3(1.,.733,.536), coral=vec3(.944,.582,.523),top=vec3(.339,.578,.678);
      vec3 col=mix(horizon,coral,smoothstep(.005,.225,h));
      col=mix(col,top,smoothstep(.13,.56,h));
      vec3 sun=normalize(vec3(-.018,.145,-1.));
      float d=length(ray-sun);
      col+=vec3(.080,.064,.014)*exp(-d*4.8);
      float disc=1.-smoothstep(.041,.0428,d);
      col=mix(col,vec3(1.,.926,.686),disc);
      vec2 uv=vec2(atan(ray.x,-ray.z)/6.2831853+.5,clamp(.016+h*1.36,0.,1.));
      float cloudsAlpha=texture2D(clouds,uv).r;
      col=mix(col,mix(vec3(.92,.60,.59),vec3(.97,.83,.77),smoothstep(.08,.37,h)),cloudsAlpha*.80);
      gl_FragColor=vec4(col,1.);
    }`
  });
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(745,36,14),material);
  mesh.frustumCulled=false;mesh.renderOrder=-10;
  return mesh;
}

function blobShadows() {
  const c=document.createElement('canvas');c.width=c.height=64;
  const ctx=c.getContext('2d'),grad=ctx.createRadialGradient(32,32,0,32,32,32);
  grad.addColorStop(0,'rgba(32,25,35,.82)');grad.addColorStop(.56,'rgba(32,25,35,.54)');grad.addColorStop(1,'rgba(32,25,35,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
  const plane=new THREE.PlaneGeometry(1,1);plane.rotateX(-Math.PI/2);
  const mat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const mesh=new THREE.InstancedMesh(plane,mat,180);
  mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=1;
  return mesh;
}

function destinationMarker() {
  const root=new THREE.Group(),gold=new THREE.MeshBasicMaterial({color:0xffd36a,transparent:true,opacity:.87,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.46,2.65,72),gold);
  ring.rotation.x=-Math.PI/2;ring.position.y=.048;root.add(ring);
  const center=new THREE.Mesh(new THREE.CircleGeometry(2.48,48),new THREE.MeshBasicMaterial({color:0xffc451,transparent:true,opacity:.13,depthWrite:false}));
  center.rotation.x=-Math.PI/2;center.position.y=.043;root.add(center);
  const arrow=new THREE.Mesh(new THREE.OctahedronGeometry(.48),gold);
  arrow.scale.y=1.6;arrow.position.y=2.5;root.add(arrow);
  root.userData.arrow=arrow;return root;
}

// Clip the camera boom against nearby building footprints so narrow alleys stay playable.
function boomFraction(x,z,dx,dz) {
  let fraction=1;
  for(const b of buildings){
    if(Math.abs(b.x-x)>b.w/2+Math.abs(dx)+.4 || Math.abs(b.z-z)>b.d/2+Math.abs(dz)+.4)continue;
    let lo=0,hi=fraction;
    for(const [origin,direction,center,half] of [[x,dx,b.x,b.w/2+.24],[z,dz,b.z,b.d/2+.24]]){
      if(Math.abs(direction)<.0001){
        if(Math.abs(origin-center)>half){lo=2;break;}
        continue;
      }
      const a=(center-half-origin)/direction, c=(center+half-origin)/direction;
      lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c));
    }
    if(lo>0 && lo<=hi)fraction=Math.max(.045,lo-.018);
  }
  return fraction;
}
export class CityView {
  constructor(canvas) {
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.6));
    this.scene=new THREE.Scene();
    this.scene.fog=new THREE.FogExp2('#e6ad98',.00385);
    this.sky=sunset();this.scene.add(this.sky);
    this.scene.add(new THREE.HemisphereLight(0xffeee0,0xb5a7ae,1.6));
    const light=new THREE.DirectionalLight(0xffdfb2,1.65);
    light.position.set(-105,150,-68);this.scene.add(light);
    buildStreets(this.scene);
    this.camera=new THREE.PerspectiveCamera(53,1,.09,800);
    this.hero=personModel(0,true);this.scene.add(this.hero);
    this.shadows=blobShadows();this.scene.add(this.shadows);
    this.marker=destinationMarker();this.scene.add(this.marker);
    this.cars=new Map();this.peds=new Map();
    this.heading=0;this.manualCamera=0;
    this.follow=new THREE.Vector3();this.look=new THREE.Vector3();
    this.shadowTransform=new THREE.Object3D();this.firstFrame=true;
    this.heroAnim={phase:0,amplitude:0};
    this.resize();
  }

  resize() {
    const w=Math.max(1,this.canvas.clientWidth),h=Math.max(1,this.canvas.clientHeight);
    if(w===this.width && h===this.height)return;
    this.width=w;this.height=h;
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
    this.camera.updateProjectionMatrix();
  }
  orbit(deltaYaw) {
    if(!Number.isFinite(deltaYaw))return;
    this.heading+=deltaYaw;this.manualCamera=2.4;
  }
  addShadow(x,z,w,d,heading) {
    const count=this.shadows.count;
    if(count>=this.shadows.instanceMatrix.count)return;
    const t=this.shadowTransform;
    t.position.set(x+.08,sidewalkHeight(x,z)+.031,z+.11);
    t.scale.set(w,1,d);t.rotation.y=-heading;t.updateMatrix();
    this.shadows.setMatrixAt(count,t.matrix);this.shadows.count=count+1;
  }
  updatePerson(mesh,anim,p,dt,hero) {
    const x=p.x,z=p.z;
    const traveled=Number.isFinite(anim.x)?Math.hypot(x-anim.x,z-anim.z):0;
    const speed=clamp(traveled/Math.max(dt,.001),0,8);
    anim.x=x;anim.z=z;anim.phase+=Math.min(traveled,.75)*3.5;
    anim.amplitude+=(Math.min(1,speed*.41)-anim.amplitude)*(1-Math.exp(-dt*12));
    const stride=Math.sin(anim.phase)*anim.amplitude;
    mesh.position.set(x,sidewalkHeight(x,z)+Math.abs(Math.cos(anim.phase))*anim.amplitude*.041,z);
    mesh.rotation.y=-p.heading;
    const [leftArm,leftLeg,rightArm,rightLeg]=mesh.userData.limbs;
    leftArm.rotation.x=stride*.53;rightArm.rotation.x=-stride*.53;
    leftLeg.rotation.x=-stride*.62;rightLeg.rotation.x=stride*.62;
    const strike=hero && p.strikeTime>0?Math.sin(clamp(1-p.strikeTime/.34,0,1)*Math.PI):0;
    rightArm.rotation.x+=strike*1.63;
    const stun=!hero && p.stunTime>0;
    mesh.rotation.z=stun?.20:0;
    if(stun){leftArm.rotation.x=.92;rightArm.rotation.x=.71;}
    this.addShadow(x,z,.92,1.10,p.heading);
  }
  updateActors(game,dt) {
    const p=game.player;
    this.shadows.count=0;this.hero.visible=p.carId==null;
    if(this.hero.visible)this.updatePerson(this.hero,this.heroAnim,p,dt,true);
    else {this.heroAnim.x=p.x;this.heroAnim.z=p.z;}
    for(const cache of [this.cars,this.peds]) for(const actor of cache.values())actor.seen=false;
    for(const car of game.cars) {
      let actor=this.cars.get(car.id);
      if(!actor){
        const mesh=carModel(car);this.scene.add(mesh);actor={mesh};this.cars.set(car.id,actor);
      }
      actor.seen=true;
      const m=actor.mesh;
      m.visible=Math.hypot(car.x-p.x,car.z-p.z)<165;
      if(!m.visible)continue;
      m.position.set(car.x,sidewalkHeight(car.x,car.z),car.z);m.rotation.y=-car.heading;
      this.addShadow(car.x,car.z,3.45,6.08,car.heading);
    }
    for(const [i,ped] of game.peds.entries()){
      const id=ped.id ?? i;
      let actor=this.peds.get(id);
      if(!actor){
        const mesh=personModel(i);this.scene.add(mesh);
        actor={mesh,phase:i*2.13,amplitude:0};this.peds.set(id,actor);
      }
      actor.seen=true;
      actor.mesh.visible=Math.hypot(ped.x-p.x,ped.z-p.z)<84;
      if(actor.mesh.visible)this.updatePerson(actor.mesh,actor,ped,dt,false);
    }
    this.shadows.instanceMatrix.needsUpdate=true;
    for(const cache of [this.cars,this.peds]) {
      for(const [id,actor] of cache)if(!actor.seen){this.scene.remove(actor.mesh);cache.delete(id);}
    }
  }
  render(game,dt) {
    if(!game || !game.player)return;
    this.resize();
    const rawDelta=Number.isFinite(dt)?dt:0;
    dt=clamp(rawDelta,0,.10);
    const p=game.player,car=p.carId!=null?game.cars.find(v=>v.id===p.carId):null;
    this.manualCamera=Math.max(0,this.manualCamera-dt);
    const speed=Math.abs(car?.speed || 0);
    if(car && this.manualCamera<=0) {
      const delta=turn(this.heading,p.heading);
      this.heading+=delta*(1-Math.exp(-dt*(speed>1?4.5:2.2)));
    }
    const s=Math.sin(this.heading),c=Math.cos(this.heading);
    const dist=car?7.3+Math.min(2,speed*.032):4.42;
    const side=car?0:1.05;
    const goalHeight=car?2.98+Math.min(.45,speed*.009):2.12;
    const dx=-s*dist+c*side,dz=c*dist+s*side;
    const boom=boomFraction(p.x,p.z,dx,dz);
    const ground=sidewalkHeight(p.x,p.z);
    const goalFov=(car?55+Math.min(speed*.19,8):54)+(this.camera.aspect<1.25?7:0);
    const easing=this.firstFrame?1:(1-Math.exp(-dt*14));
    this.follow.set(p.x+dx*boom,ground+goalHeight,p.z+dz*boom);
    this.camera.position.lerp(this.follow,easing);
    // A fast move out of a tight alley must also bring a lagging camera back through the opening.
    const actualX=this.camera.position.x-p.x,actualZ=this.camera.position.z-p.z;
    const actualBoom=boomFraction(p.x,p.z,actualX,actualZ);
    if(actualBoom<1){this.camera.position.x=p.x+actualX*actualBoom;this.camera.position.z=p.z+actualZ*actualBoom;}
    this.look.set(p.x+s*(car?5:3.6)+c*side*.43,ground+(car?1.10:1.31),p.z-c*(car?5:3.6)+s*side*.43);
    this.camera.lookAt(this.look);
    if(Math.abs(this.camera.fov-goalFov)>.12){this.camera.fov+= (goalFov-this.camera.fov)*easing;this.camera.updateProjectionMatrix();}
    this.sky.position.copy(this.camera.position);
    this.updateActors(game,dt);
    const target=game.target;
    this.marker.visible=!!target;
    if(target){
      this.marker.position.set(target.x,sidewalkHeight(target.x,target.z),target.z);
      this.marker.userData.arrow.position.y=2.4+Math.sin((game.time||0)*3.5)*.22;
      this.marker.userData.arrow.rotation.y=(game.time||0)*1.50;
    }
    this.renderer.render(this.scene,this.camera);this.firstFrame=false;
  }
}
