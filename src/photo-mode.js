// A reversible view of the current scene. It changes no story state or lighting.
export class PhotoMode {
  constructor(g) {
    this.g=g;this.active=false;this.state=null;
    this.root=document.createElement('section');this.root.id='photo-tools';this.root.className='hidden';
    this.root.setAttribute('aria-label','Photo mode controls');
    const title=document.createElement('h2');title.textContent='Photo mode';
    const help=document.createElement('p');help.textContent='Drag to orbit · Wheel to move closer · H hides controls · Esc returns';
    const lensLabel=document.createElement('label');lensLabel.textContent='Lens';
    this.lens=document.createElement('input');this.lens.type='range';this.lens.min='35';this.lens.max='80';this.lens.value='58';
    this.lens.setAttribute('aria-label','Lens field of view');this.lensValue=document.createElement('output');
    this.lens.oninput=()=>{g.camera.fov=Number(this.lens.value);g.camera.updateProjectionMatrix();this.lensValue.textContent=this.lens.value+'°';};
    lensLabel.append(this.lens,this.lensValue);
    const row=document.createElement('div');row.className='photo-actions';
    this.traveler=document.createElement('button');this.traveler.textContent='Traveler shown';this.traveler.setAttribute('aria-pressed','true');
    this.traveler.onclick=()=>{this.showTraveler=!this.showTraveler;g.player.group.visible=this.showTraveler;this.traveler.setAttribute('aria-pressed',String(this.showTraveler));this.traveler.textContent=this.showTraveler?'Traveler shown':'Traveler hidden';};
    const grid=document.createElement('button');grid.textContent='Composition grid';grid.setAttribute('aria-pressed','false');
    grid.onclick=()=>{const on=document.body.classList.toggle('photo-grid');grid.setAttribute('aria-pressed',String(on));};
    this.gridButton=grid;
    this.palette=document.createElement('button');this.palette.textContent='Fresco palette';this.palette.setAttribute('aria-pressed','false');this.palette.disabled=!g.post.ok;
    this.palette.onclick=()=>{g.polish.options.fresco=!g.polish.options.fresco;this.palette.setAttribute('aria-pressed',String(g.polish.options.fresco));};
    const capture=document.createElement('button');capture.textContent='Save image';capture.onclick=()=>this.capture();
    const back=document.createElement('button');back.textContent='Return to game';back.onclick=()=>this.close();
    row.append(this.traveler,grid,this.palette,capture,back);this.root.append(title,help,lensLabel,row);document.body.append(this.root);
    this.hint=document.createElement('div');this.hint.id='photo-hint';this.hint.textContent='H: show controls · Esc: return';document.body.append(this.hint);
    const button=this.button=document.createElement('button');button.className='btn ghost';button.textContent='Photo mode · F6';button.onclick=()=>{if(!this.enter())g.ui.announce('Photo mode is available during free exploration.');};
    document.querySelector('#pause .panel').insertBefore(button,document.getElementById('restartAsk'));
  }
  enter() {
    const g=this.g;
    if(this.active || !['play','paused'].includes(g.mode) || (g.busy && !(g.cityVision?.active && !g.cityVision.revealing && g.busy===g.cityVision.entryBusy)) || g.frozen || g.overlayOpen() || g.cam.mode!=='follow')return false;
    this.state={mode:g.mode,position:g.camera.position.clone(),rotation:g.camera.quaternion.clone(),fov:g.camera.fov,
      cam:{yaw:g.cam.yaw,pitch:g.cam.pitch,want:g.cam.want,cur:g.cam.cur,dYaw:g.cam.dYaw,dPitch:g.cam.dPitch,fov:g.cam.fov,ahead:g.cam.ahead,fYaw:g.cam.fYaw,t:g.cam.t.clone()},snap:g.snapCam,
      traveler:g.player.group.visible,beam:g.beam.visible,blur:g.post.blur,fresco:g.polish.options.fresco,hud:document.getElementById('hud').classList.contains('hidden'),pause:document.getElementById('pause').classList.contains('hidden')};
    this.active=true;this.showTraveler=g.player.group.visible;g.mode='photo';g.keys.clear();g.pressed.clear();g.cam.drag=false;g.cam.ahead=g.cam.ahead || 0;
    g.beam.visible=false;g.post.blur=false;g.post.havePrev=false;document.getElementById('hud').classList.add('hidden');document.getElementById('pause').classList.add('hidden');
    document.body.classList.add('photo-mode');document.body.classList.remove('photo-clean','photo-grid','game-paused');
    this.gridButton.setAttribute('aria-pressed','false');this.traveler.setAttribute('aria-pressed',String(g.player.group.visible));
    this.palette.setAttribute('aria-pressed',String(g.polish.options.fresco));
    this.traveler.textContent=g.player.group.visible?'Traveler shown':'Traveler hidden';
    this.lens.value=String(g.camera.fov);this.lensValue.textContent=this.lens.value+'°';this.root.classList.remove('hidden');
    this.root.querySelector('button').focus();g.ui.announce('Photo mode. Play is frozen. Drag to orbit, use the lens control, and press Escape to return.');return true;
  }
  key(e) {
    if(e.ctrlKey || e.metaKey || e.altKey)return;
    if(e.repeat && ['Enter','Space'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();return;}
    if((e.code==='Escape' || e.code==='F6') && !e.repeat){e.preventDefault();e.stopImmediatePropagation();this.close();return;}
    if(e.code==='KeyH' && !e.repeat){e.preventDefault();document.body.classList.toggle('photo-clean');if(document.body.classList.contains('photo-clean'))this.g.canvas.focus();}
    if(e.code==='Tab'){
      if(document.body.classList.contains('photo-clean'))document.body.classList.remove('photo-clean');
      const all=Array.from(this.root.querySelectorAll('input,button')),index=all.indexOf(document.activeElement);
      const next=e.shiftKey?(index<=0?all.length-1:index-1):(index+1)%all.length;e.preventDefault();all[next].focus();
    }
    if(e.target===this.g.canvas && ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    e.stopImmediatePropagation();
  }
  update(dt){this.g.updateCamera(dt);this.g.player.group.visible=this.showTraveler && this.g.player.group.visible;}
  imageData(){if(!this.active)return null;this.g.render(0);return this.g.canvas.toDataURL('image/png');}
  capture() {
    if(!this.active)return;
    try{
      const link=document.createElement('a');
      link.download='city-in-speech-'+Date.now()+'.png';link.href=this.imageData();link.click();
      this.g.ui.announce('PNG prepared for download. Controls and grid are excluded.');
    }catch{this.g.ui.announce('The browser could not save the image. You can still use your usual screenshot shortcut.');}
  }
  close() {
    if(!this.active)return;
    const g=this.g,s=this.state;this.active=false;g.mode=s.mode;
    const {t,...cam}=s.cam;Object.assign(g.cam,cam);g.cam.t.copy(t);g.cam.drag=false;g.snapCam=s.snap;
    g.camera.position.copy(s.position);g.camera.quaternion.copy(s.rotation);g.camera.fov=s.fov;g.camera.updateProjectionMatrix();
    g.player.group.visible=s.traveler;g.beam.visible=s.beam;g.post.blur=s.blur;g.post.havePrev=false;g.keys.clear();g.pressed.clear();g.last=performance.now();g.acc=0;
    g.polish.options.fresco=s.fresco;
    document.getElementById('hud').classList.toggle('hidden',s.hud);document.getElementById('pause').classList.toggle('hidden',s.pause);
    document.body.classList.remove('photo-mode','photo-clean','photo-grid');this.root.classList.add('hidden');this.state=null;
    document.body.classList.toggle('game-paused',g.mode==='paused');
    if(g.mode==='paused')this.button.focus();else g.canvas.focus();g.ui.announce('Returned from photo mode.');
  }
}
