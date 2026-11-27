import { buildings, laneMarkings, streets } from './city.js';

// Software-rendered overhead view for WebViews whose graphics driver disables WebGL.
export class OverheadView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.heading = 0;
    this.ground = document.createElement('canvas');
    const g = this.ground.getContext('2d');
    this.ground.width = this.ground.height = 1160;
    g.scale(2, 2);g.translate(290,290);
    g.fillStyle='#419d9a';g.fillRect(-290,-290,580,580);
    g.fillStyle='#c1a380';g.fillRect(-256,-256,512,512);
    for (const r of streets) {
      g.fillStyle='#54515b';g.fillRect(r-10,-255,20,510);g.fillRect(-255,r-10,510,20);
    }
    g.strokeStyle='#f7ce83';g.lineWidth=.65;g.setLineDash([4,4]);
    g.beginPath();
    for (const r of streets) for (let j=-240;j<240;j+=80) {
      g.moveTo(j+12,r);g.lineTo(j+68,r);g.moveTo(r,j+12);g.lineTo(r,j+68);
    }
    g.stroke();
    g.strokeStyle='#ddd3bc';g.lineWidth=.28;g.setLineDash([3.25,6.75]);
    g.beginPath();
    for (const r of streets) for (let j=-240;j<240;j+=80) {
      for (const offset of [-laneMarkings.divider, laneMarkings.divider]) {
        g.moveTo(j+18.4,r+offset);g.lineTo(j+62,r+offset);
        g.moveTo(r+offset,j+18.4);g.lineTo(r+offset,j+62);
      }
    }
    g.stroke();
    for (const b of buildings) {
      const x=b.x-b.w/2,z=b.z-b.d/2;
      g.fillStyle='#5d4e50';g.fillRect(x+2,z+2,b.w,b.d);
      g.fillStyle=['#d87c6b','#d4af89','#9dc6b0','#d39182'][b.style%4];g.fillRect(x,z,b.w,b.d);
      g.fillStyle='#ffebcc66';g.fillRect(x,z,1,b.d);g.fillRect(x,z,b.w,1);
      g.fillStyle='#806f6b';g.fillRect(x+3,z+3,4,3);
    }
  }

  orbit() {}
  render(game) {
    const canvas=this.canvas, c=this.ctx, w=canvas.clientWidth,h=canvas.clientHeight;
    const ratio=Math.min(devicePixelRatio,1.6);
    if (canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)) {
      canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    }
    const scale=h/(game.player.carId?102:74);
    c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle='#419d9a';c.fillRect(0,0,w,h);
    c.translate(w/2,h/2);c.scale(scale,scale);c.translate(-game.player.x,-game.player.z);
    c.drawImage(this.ground,-290,-290,580,580);
    for(const car of game.cars){
      c.save();c.translate(car.x,car.z);c.rotate(car.heading);
      c.fillStyle='#332e33';c.fillRect(-1.3,-2.2,2.6,4.7);
      c.fillStyle='#'+car.color.toString(16).padStart(6,'0');c.fillRect(-1.2,-2.55,2.4,4.8);
      c.fillStyle='#294353';c.fillRect(-.96,-1.35,1.92,1.35);
      c.fillStyle='#ffc78a';c.fillRect(-1.1,-2.5,.55,.25);c.fillRect(.55,-2.5,.55,.25);
      c.fillStyle='#f35c58';c.fillRect(-1.05,1.9,2.1,.24);c.restore();
    }
    for(const ped of game.peds){c.beginPath();c.arc(ped.x,ped.z,.58,0,Math.PI*2);c.fillStyle='#a24f58';c.fill();}
    if (!game.player.carId){
      c.save();c.translate(game.player.x,game.player.z);c.rotate(game.player.heading);
      c.fillStyle='#1f676e';c.fillRect(-.8,-.3,1.6,1);c.fillStyle='#ffc297';c.beginPath();c.arc(0,-.25,.48,0,Math.PI*2);c.fill();c.restore();
    }
    if(game.target){c.strokeStyle='#ffd575';c.lineWidth=.45;c.beginPath();c.arc(game.target.x,game.target.z,3.9+Math.sin(game.time*4)*.35,0,Math.PI*2);c.stroke();}
  }
}
