// Six nearby birds reuse the game's skinned gull. The existing high circling
// flocks remain scenery; these birds react to the player's actual movement.
import { Animal } from './animals.js';
import { clamp, dampAngle } from './util.js';

const smooth=(t)=>t*t*(3-2*t);
export class DockGulls {
  constructor(g) {
    this.g=g;this.birds=[];
    for(const [cx,cz] of [[-4,53],[48,53]]) for(let i=0;i<3;i++) {
      const x=cx+(i-1)*0.95,z=cz+Math.sin(i*2.3)*0.8,y=g.world.standY(x,z);
      const bird=new Animal('gull',901+this.birds.length,{state:'idle'});
      bird.place(x,z,i*2.1,y);bird.mesh.castShadow=true;bird.mesh.receiveShadow=true;g.world.group.add(bird.group);
      this.birds.push({bird,home:{x,y,z},phase:'rest',time:0,wait:i*0.2,turn:i%2?1:-1,angle:0});
    }
    g.tickers.push((dt)=>this.update(dt));
  }
  update(dt) {
    const g=this.g,p=g.player;
    for(const b of this.birds) {
      const a=b.bird,h=b.home,d=Math.hypot(p.x-h.x,p.z-h.z);
      a.group.visible=g.space==='world' && d<95;
      if(!a.group.visible)continue;
      a.mesh.castShadow=d<25;
      if(g.reduceMotion){a.update(0);continue;}
      const ox=a.x,oz=a.z;
      b.time+=dt;b.wait=Math.max(0,b.wait-dt);
      if(b.phase==='rest') {
        a.state='idle';a.bank=0;
        a.heading=dampAngle(a.heading,Math.sin(g.time*0.18+a.seed)*0.6,1.4,dt);
        if(!g.busy && !b.wait && ((p.speed>4 && d<3.8) || (p.speed>0.3 && d<1.1))) {
          b.phase='out';b.time=0;
          b.start={x:a.x,y:a.y,z:a.z};
          b.center={x:h.x+b.turn*3,y:h.y+5.5,z:h.z+10};
          a.state='fly';
        }
      } else if(b.phase==='out') {
        const t=clamp(b.time/2.4,0,1),s=smooth(t);
        a.x=b.start.x+(b.center.x+3-b.start.x)*s;
        a.z=b.start.z+(b.center.z-b.start.z)*s;
        a.y=b.start.y+(b.center.y-b.start.y)*Math.sin(t*Math.PI/2);
        if(t===1){b.phase='circle';b.time=0;b.angle=0;}
      } else if(b.phase==='circle') {
        b.angle+=b.turn*dt*0.8;
        a.x=b.center.x+Math.cos(b.angle)*3;a.z=b.center.z+Math.sin(b.angle)*3;
        a.y=b.center.y+Math.sin(b.angle*2)*0.35;a.bank=b.turn*0.22;
        if(b.time>10 && d>6){b.phase='return';b.time=0;b.start={x:a.x,y:a.y,z:a.z};}
      } else {
        const t=clamp(b.time/3.5,0,1),s=smooth(t);
        a.x=b.start.x+(h.x-b.start.x)*s;a.z=b.start.z+(h.z-b.start.z)*s;
        a.y=h.y+(b.start.y-h.y)*(1-s);a.bank*=Math.exp(-dt*4);
        if(d<2.3 && p.speed>0.3){b.phase='out';b.time=0;b.start={x:a.x,y:a.y,z:a.z};}
        else if(t===1){b.phase='rest';b.time=0;b.wait=4;a.state='idle';}
      }
      if(b.phase!=='rest' && Math.hypot(a.x-ox,a.z-oz)>0.00001)
        a.heading=dampAngle(a.heading,Math.atan2(a.x-ox,a.z-oz),6,dt);
      a.update(dt);
    }
  }
}
