// Shows which nearby person or object the E prompt refers to in a crowded scene.
import * as THREE from 'three';
export class InteractionMarker {
  constructor(g) {
    this.g=g;
    this.ring=new THREE.Mesh(new THREE.RingGeometry(.46,.51,40),new THREE.MeshBasicMaterial({color:0xe7c47d,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide}));
    this.ring.rotation.x=-Math.PI/2;this.ring.visible=false;g.scene.add(this.ring);
    g.presenters.push(()=>this.update());
  }
  update() {
    const g=this.g,target=g.nearbyInteraction;
    this.ring.visible=!!(target && g.mode==='play' && (!g.busy || g.cityVision?.exploring) && !g.frozen && !g.overlayOpen() && g.cam.mode==='follow' && g.polish?.options.marker!==false);
    if(!this.ring.visible)return;
    const y=target.npc?target.npc.actor.y:g.spaces[g.space].ground(target.x,target.z);
    this.ring.position.set(target.x,y+.035,target.z);
    this.ring.scale.setScalar(g.reduceMotion?1:1+Math.sin(g.time*2.4)*.035);
  }
}
