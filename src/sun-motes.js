// Sunlit specks in sheltered outdoor spaces; one small, depth-tested draw.
import * as THREE from 'three';
import {mulberry32} from './util.js';
export class SunMotes {
  constructor(g) {
    this.g=g;const random=mulberry32(7419),positions=[],seeds=[];
    this.areas=[[-58,-203,13],[42,-6,12],[-46,-47,11]];
    for(let i=0;i<96;i++){
      const angle=random()*Math.PI*2,radius=Math.sqrt(random())*11;
      positions.push(Math.cos(angle)*radius,.7+random()*4.7,Math.sin(angle)*radius);seeds.push(random());
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
    this.uniforms={uTime:{value:0},uHeight:{value:innerHeight},uStrength:{value:0},uWind:{value:new THREE.Vector2()}};
    const material=new THREE.ShaderMaterial({
      uniforms:this.uniforms,transparent:true,depthWrite:false,
      vertexShader:'attribute float aSeed; uniform float uTime,uHeight,uStrength;uniform vec2 uWind;varying float vAlpha;void main(){vec3 p=position;p.x+=sin(uTime*.22+aSeed*31.)*.55+uWind.x*.18;p.z+=cos(uTime*.18+aSeed*27.)*.45+uWind.y*.18;p.y+=sin(uTime*.3+aSeed*19.)*.3;vec4 mv=modelViewMatrix*vec4(p,1.);float nearFade=smoothstep(1.,3.,-mv.z);float farFade=1.-smoothstep(15.,30.,-mv.z);vAlpha=uStrength*nearFade*farFade*(.35+.65*aSeed);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uHeight*(.018+.018*aSeed)/max(1.,-mv.z),1.,4.);}',
      fragmentShader:'varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.05,1.,r))*vAlpha;if(a<.015)discard;gl_FragColor=vec4(1.,.86,.57,a);}',
    });
    this.points=new THREE.Points(geometry,material);this.points.visible=false;
    this.points.frustumCulled=false;g.scene.add(this.points);this.direction=new THREE.Vector3();
    g.presenters.push(()=>this.update());
  }
  update() {
    const g=this.g,p=g.player;
    const area=this.areas.find(([x,z,r])=>Math.hypot(p.x-x,p.z-z)<r+5);
    const active=area && g.space==='world' && !g.reduceMotion && g.polish?.options.motes!==false
      && g.sky.cur.stars<.1 && g.sky.cur.cov<.7 && g.sky.sunDir.y>.08
      && g.post.ok && (g.post.scale || 1)>=.85 && !g.world.indoor(p.x,p.z);
    this.points.visible=!!active;if(!active)return;
    const [x,z,r]=area;this.points.position.set(x,g.world.groundY(x,z),z);
    g.camera.getWorldDirection(this.direction);
    const facing=Math.max(0,this.direction.dot(g.sky.sunDir));
    const edge=1-THREE.MathUtils.smoothstep(Math.hypot(p.x-x,p.z-z),r,r+5);
    this.uniforms.uStrength.value=(.12+.38*facing*facing)*edge;
    this.uniforms.uTime.value=g.time;this.uniforms.uHeight.value=g.canvas.height;
    this.uniforms.uWind.value.set((g.gusts?.dx || 0)*(g.gusts?.v || 0),(g.gusts?.dz || 0)*(g.gusts?.v || 0));
  }
}
