// Local hull wash and submerged light patterns. Reuses the sea's clock and wave
// dimensions; boats are moored, so these are lapping rings rather than travelling wakes.
import * as THREE from 'three';
import { getNoise } from './world.js';

export const WAVE_VERTEX = [   // also used by the moving boats' wakes (harbor-boats.js)

  'uniform float uTime;',
  'vec3 waterPoint(vec3 p) {',
  'vec3 origin = p; float fade = 1.0 - smoothstep(160.0,300.0,length(p.xz-vec2(0.0,70.0)));',
  'vec4 wave[5]; wave[0]=vec4(0.8,0.6,7.0,0.12); wave[1]=vec4(-0.28,0.96,5.5,0.08);',
  'wave[2]=vec4(0.95,-0.31,11.0,0.15); wave[3]=vec4(0.45,0.89,17.0,0.11); wave[4]=vec4(0.2,0.98,27.0,0.13);',
  'for(int i=0;i<5;i++){vec2 d=normalize(wave[i].xy);float k=6.2832/wave[i].z;',
  'float f=k*(dot(d,origin.xz)-sqrt(9.8/k)*uTime*0.8)+float(i)*1.7;float a=wave[i].w*fade;',
  'p.xz += 0.55*a*d*cos(f);p.y += a*sin(f); } return p; }',
].join('\n');

export class HarborDetail {
  constructor(g) {
    this.g = g;
    this.group = new THREE.Group(); g.scene.add(this.group);
    this.uniforms = {
      uTime: { value: 0 }, uDay: { value: 1 },
      uNoise: { value: getNoise()[0] }, uTint: { value: new THREE.Color(0xb8ded9) },
    };
    this.makeHullWash();
    this.makeCaustics();
    this.group.visible = !g.polish || g.polish.options.harbor !== false;   // the title screen draws before the first update
    g.presenters.push(() => this.update());
  }
  makeHullWash() {
    const p = [], uv = [], phase = [], indices = [];
    this.hulls = [];
    for (const boat of this.g.sites.afloat) {
      const dims = boat.id === 'ship_trireme' ? [2.25,16.5] : boat.id === 'boat_small' ? [0.72,2.25] : [2.45,8.1];
      const x = boat.o.position.x, z = boat.o.position.z, rot = boat.o.rotation.y;
      const c = Math.cos(rot), s = Math.sin(rot), first = p.length / 3, n = 96;
      this.hulls.push({ id: boat.id, x, z, width: dims[0] * 2, length: dims[1] * 2 });
      for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2;
        for (let edge = 0; edge < 2; edge++) {
          const swell = edge * 0.62, lx = Math.sin(a) * (dims[0] + swell), lz = Math.cos(a) * (dims[1] + swell);
          p.push(x + lx*c + lz*s, 0.035, z - lx*s + lz*c);
          uv.push(edge, i/n * Math.max(8, dims[1]*2)); phase.push(x*0.31 + z*0.13);
        }
      }
      for (let i = 0; i < n; i++) { const a = first+i*2; indices.push(a,a+1,a+2,a+1,a+3,a+2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setAttribute('aPhase',new THREE.Float32BufferAttribute(phase,1)); geo.setIndex(indices);
    geo.computeBoundingSphere(); geo.boundingSphere.radius += 1;
    this.foam = new THREE.Mesh(geo,new THREE.ShaderMaterial({
      uniforms:this.uniforms, transparent:true, depthWrite:false, side:THREE.DoubleSide,
      vertexShader:[
        WAVE_VERTEX, 'attribute float aPhase; varying vec2 vUv; varying vec3 vWorld; varying float vPhase;',
        'void main(){ vUv=uv;vPhase=aPhase;vWorld=waterPoint(position);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}',
      ].join('\n'),
      fragmentShader:[
        'uniform sampler2D uNoise;uniform float uTime,uDay;uniform vec3 uTint;',
        'varying vec2 vUv;varying vec3 vWorld;varying float vPhase;',
        'void main(){float n=texture2D(uNoise,vec2(vUv.y*0.12-uTime*0.025,vUv.x*0.55+vPhase)).g;',
        'float lap=0.5+0.5*sin(uTime*1.4+vUv.y*0.8+vPhase);',
        'float strands=pow(max(0.0,1.0-abs(vUv.x-(0.18+0.28*lap+(n-0.5)*0.25))*3.7),2.0);',
        'float holes=smoothstep(0.28,0.62,n+lap*0.13);',
        'float fade=1.0-smoothstep(65.0,145.0,distance(cameraPosition,vWorld));',
        'gl_FragColor=vec4(uTint,strands*holes*fade*(0.13+uDay*0.24));',
        '#include <tonemapping_fragment>',
        '#include <colorspace_fragment>',
        '}',
      ].join('\n'),
    }));
    this.foam.renderOrder=805; this.group.add(this.foam);
  }
  makeCaustics() {
    const lines=[[-93,58.3,93,58.3,0,1]];
    for(const x of [-60,60]) lines.push([x-3.5,58.3,x-3.5,97.5,-1,0],[x+3.5,58.3,x+3.5,97.5,1,0],[x-3.5,97.5,x+3.5,97.5,0,1]);
    const p=[],idx=[];
    for(const [x0,z0,x1,z1,nx,nz] of lines) {
      const first=p.length/3;
      for(const [x,z] of [[x0,z0],[x1,z1]]) for(const y of [-1.6,0.62]) p.push(x+nx*0.045,y,z+nz*0.045);
      idx.push(first,first+1,first+2,first+1,first+3,first+2);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(idx);
    this.caustics=new THREE.Mesh(geo,new THREE.ShaderMaterial({
      // Same opaque queue as the sea, so the pattern is drawn on the wall BEFORE
      // the water blends over it. A transparent material would fail water's depth test.
      uniforms:this.uniforms,transparent:false,depthWrite:false,side:THREE.DoubleSide,
      blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneFactor,
      vertexShader:'varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}',
      fragmentShader:[
        'uniform float uTime,uDay;varying vec3 vWorld;',
        'vec2 hash(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}',
        'float cells(vec2 p){vec2 i=floor(p),f=fract(p);float a=10.0,b=10.0;',
        'for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 q=vec2(float(x),float(y));',
        'vec2 h=hash(i+q);vec2 r=q+0.5+0.31*sin(uTime*0.65+6.283*h)-f;float d=dot(r,r);',
        'if(d<a){b=a;a=d;}else if(d<b)b=d;}return 1.0-smoothstep(0.015,0.12,sqrt(b)-sqrt(a));}',
        'void main(){vec2 p=vec2((vWorld.x+vWorld.z)*1.25,vWorld.y*2.1);',
        'p+=vec2(sin(p.y*1.8+uTime*0.4),cos(p.x*1.3-uTime*0.35))*0.16;',
        // Underwater focusing and a softer reflected shimmer just above the water.
        'float c=cells(p);float band=smoothstep(-1.6,-1.0,vWorld.y)*(1.0-smoothstep(0.08,0.62,vWorld.y));',
        'float range=1.0-smoothstep(22.0,65.0,distance(cameraPosition,vWorld));',
        'gl_FragColor=vec4(0.37,0.66,0.57,c*band*range*uDay*0.34);}',
      ].join('\n'),
    }));
    this.caustics.renderOrder=795;this.group.add(this.caustics);
  }
  update() {
    const g=this.g,cur=g.sky.cur;
    this.group.visible=g.space==='world' && (g.polish ? g.polish.options.harbor !== false : true);
    this.uniforms.uTime.value=g.sea.u.uMisc.value.w;
    const day=Math.max(0,Math.min(1,(1-cur.stars)*Math.max(0,g.sky.sunDir.y)*3))*(1-Math.min(1,cur.cov*1.3));
    this.uniforms.uDay.value=day;
    this.uniforms.uTint.value.setRGB(0.39+day*0.38,0.52+day*0.34,0.58+day*0.28);
    this.caustics.visible=day>0.05 && g.post.scale>=0.85;
  }
}
