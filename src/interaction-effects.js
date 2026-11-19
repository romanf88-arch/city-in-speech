// Pooled physical accents for scripted actions. Emitters follow real hand/prop
// transforms; effects and extra waits are skipped by story automation.
import * as THREE from 'three';

export class InteractionEffects {
  constructor(g) {
    this.g=g;this.pool=Array.from({length:192},()=>({life:0,total:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,gravity:3}));
    this.pos=new Float32Array(192*3);this.color=new Float32Array(192*3);this.life=new Float32Array(192);this.size=new Float32Array(192);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(this.pos,3));geometry.setAttribute('aColor',new THREE.BufferAttribute(this.color,3));
    geometry.setAttribute('aLife',new THREE.BufferAttribute(this.life,1));geometry.setAttribute('aSize',new THREE.BufferAttribute(this.size,1));
    this.points=new THREE.Points(geometry,new THREE.ShaderMaterial({
      uniforms:{uHeight:{value:window.innerHeight}},
      vertexShader:[
        'uniform float uHeight;attribute vec3 aColor;attribute float aLife,aSize;varying vec3 vColor;varying float vLife;',
        'void main(){vColor=aColor;vLife=aLife;vec4 p=modelViewMatrix*vec4(position,1.0);',
        'gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*uHeight/max(-p.z,0.1),1.0,7.0);}',
      ].join('\n'),
      fragmentShader:'varying vec3 vColor;varying float vLife;void main(){float r=length(gl_PointCoord-0.5)*2.0;float a=(1.0-smoothstep(0.4,1.0,r))*smoothstep(0.0,0.2,vLife)*0.72;gl_FragColor=vec4(vColor,a);}',
      transparent:true,depthWrite:false,toneMapped:false,
    }));
    this.points.visible=false;this.points.frustumCulled=false;g.scene.add(this.points);
    this.emitter=null;this._from=new THREE.Vector3();this.lastAction=null;
    g.tickers.push((dt)=>this.update(dt));
  }
  origin(actor,source,offset,out=this._from) {
    const object=source || actor.bones.handR;
    object.updateWorldMatrix(true,false);
    return out.copy(offset || new THREE.Vector3()).applyMatrix4(object.matrixWorld);
  }
  emit(e) {
    const q=this.pool.find((p)=>p.life<=0);if(!q)return;
    const from=this.origin(e.actor,e.source,e.offset),to=typeof e.to==='function'?e.to():e.to,t=e.kind==='steam'?0.8:0.5+Math.random()*0.22;
    q.total=q.life=t;q.x=from.x;q.y=from.y;q.z=from.z;
    q.gravity=e.kind==='steam'?-0.15:3.5;
    q.vx=(to.x-from.x)/t+(Math.random()-0.5)*(e.kind==='grain'?0.65:0.12);
    q.vz=(to.z-from.z)/t+(Math.random()-0.5)*(e.kind==='grain'?0.65:0.12);
    if(e.kind==='steam'){q.vx=(Math.random()-0.5)*0.16;q.vz=(Math.random()-0.5)*0.16;}
    q.vy=e.kind==='steam'?0.3+Math.random()*0.3:(to.y-from.y)/t+0.5*q.gravity*t;
    q.kind=e.kind;
  }
  update(dt) {
    const g=this.g;
    if(this.emitter && !g.reduceMotion) {
      this.emitter.time-=dt;this.emitter.clock-=dt;
      while(this.emitter.clock<=0 && this.emitter.time>0) {
        this.emit(this.emitter);this.emitter.clock+=this.emitter.kind==='water'?0.012:0.025;
      }
      if(this.emitter.time<=0)this.emitter=null;
    } else if(g.reduceMotion)this.emitter=null;
    let active=0;
    this.pool.forEach((q,i)=>{
      q.life=g.reduceMotion?0:Math.max(0,q.life-dt);
      if(q.life>0) {active++;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;q.vy-=q.gravity*dt;}
      this.pos.set([q.x,q.y,q.z],i*3);this.life[i]=q.life/q.total;
      this.size[i]=q.kind==='grain'?0.012:q.kind==='steam'?0.032:0.019;
      this.color.set(q.kind==='grain'?[0.78,0.65,0.34]:q.kind==='steam'?[0.70,0.70,0.65]:[0.64,0.81,0.88],i*3);
    });
    this.points.visible=active>0;
    if(active) {
      for(const a of Object.values(this.points.geometry.attributes))a.needsUpdate=true;
      this.points.material.uniforms.uHeight.value=g.renderer.domElement.height;
    }
  }
  async play(kind,actor,to,options={}) {
    this.lastAction=kind;
    const g=this.g;
    if(g.ui.auto)return;
    if(kind==='water')g.audio.water();else if(kind==='grain')g.audio.grains();else g.audio.hiss();
    if(g.reduceMotion)return;
    actor.play(kind==='water'?'pour':kind==='grain'?'scatter':'offer');
    await g.wait(0.34);
    this.emitter={kind,actor,to:typeof to==='function'?to:new THREE.Vector3(to.x,to.y,to.z),source:options.source,offset:options.offset,clock:0,time:kind==='water'?0.9:0.6};
    await g.wait(kind==='water'?1.25:0.95);
  }
  get activeCount(){return this.pool.filter((p)=>p.life>0).length;}
}
