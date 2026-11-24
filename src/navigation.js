// A personal bearing for exploration. It never changes a story objective.
export class Navigation {
  constructor(g) {
    this.g=g;this.target=null;
    const canvas=document.getElementById('mapCanvas');
    const panel=canvas.parentElement;
    const controls=document.createElement('div');controls.className='map-navigation';
    const label=document.createElement('label');label.textContent='Walk to a place';
    this.select=document.createElement('select');label.append(this.select);
    const mark=this.markButton=document.createElement('button');mark.className='btn';mark.textContent='Set marker';
    const clear=this.clearButton=document.createElement('button');clear.className='btn ghost';clear.textContent='Clear marker';clear.disabled=true;
    this.status=document.createElement('p');this.status.setAttribute('role','status');
    const legend=document.createElement('div');legend.className='map-legend';legend.setAttribute('aria-label','Map symbols');
    for(const [kind,text] of [['traveler','You'],['objective','Story destination'],['personal','Your marker']]){const item=document.createElement('span'),symbol=document.createElement('i');symbol.className=kind;symbol.setAttribute('aria-hidden','true');item.append(symbol,document.createTextNode(text));legend.append(item);}
    controls.append(label,mark,clear,this.status,legend);panel.append(controls);
    canvas.setAttribute('role','img');
    this.select.onchange=()=>this.updateActions();
    mark.onclick=()=>{
      if(g.space==='cave')return;
      if(this.select.value==='')return;
      const place=this.places[Number(this.select.value)];
      if(place)this.set(place.x,place.z,place.text,place.lydia?'lydia':'world');
    };
    clear.onclick=()=>this.clear();
    // Native form controls retain their arrow keys, letters, spaces and zoom.
    controls.addEventListener('keydown',e=>{if(e.code!=='Escape')e.stopPropagation();});
    canvas.addEventListener('click',e=>{
      const p=this.projection;if(!p || g.space==='cave')return;
      const rect=canvas.getBoundingClientRect();
      const x=((e.clientX-rect.left)*canvas.width/rect.width-p.ox)/p.s+p.view.x0;
      const z=((e.clientY-rect.top)*canvas.height/rect.height-p.oz)/p.s+p.view.z0;
      if(x<p.view.x0 || x>p.view.x1 || z<p.view.z0 || z>p.view.z1)return;
      if(!g.spaces[g.space].walkable(x,z)){this.status.textContent='Choose a point on land, or select a named place.';return;}
      const place=this.places.find(place=>Math.hypot(place.x-x,place.z-z)<12);
      this.set(place?.x ?? x,place?.z ?? z,place?.text || 'Your marker',g.space);
    });
    g.tickers.push(()=>this.update());
  }
  refresh() {
    const g=this.g,lydia=g.space==='lydia';
    this.places=(g.mapLabels || []).filter(p=>!!p.lydia===lydia);
    this.select.replaceChildren(...this.places.map((p,i)=>{
      const option=document.createElement('option');option.value=String(i);option.textContent=p.text;return option;
    }));
    this.select.disabled=g.space==='cave' || !this.places.length;
    document.getElementById('mapCanvas').setAttribute('aria-label','Map of '+(g.space==='lydia'?'Lydia':g.space==='cave'?'the cave':'the Piraeus')+'. Use the place menu to set a walking marker. A red arrow shows your position.');
    this.syncSelection();
    this.status.textContent=g.space==='cave'?'Markers are for outdoor exploration.':this.target?'Walking to '+this.target.label+'. The compass shows a direct bearing.':'Choose a named place or click land on the map. Follow streets and paths around obstacles.';
    if(this.target && this.target.space!==g.space && g.space!=='cave')this.status.textContent='Your marker is in '+(this.target.space==='world'?'the Piraeus':'Lydia')+'. Return there to follow its bearing.';
  }
  syncSelection() {
    this.select.querySelector('option[value=""]')?.remove();
    const target=this.target;if(!target || target.space!==this.g.space){this.updateActions();return;}
    const index=(this.places || []).findIndex(p=>p.text===target.label || Math.hypot(p.x-target.x,p.z-target.z)<1);
    if(index>=0)this.select.value=String(index);
    else {const option=document.createElement('option');option.value='';option.disabled=true;option.textContent='Current marker: '+target.label;this.select.prepend(option);this.select.value='';}
    this.updateActions();
  }
  updateActions(){this.markButton.disabled=this.select.disabled || this.select.value==='';this.clearButton.disabled=!this.target;}
  set(x,z,label,space) {
    if(!Number.isFinite(x) || !Number.isFinite(z) || !['world','lydia'].includes(space))return false;
    this.target={x,z,label,space};this.g.keys.clear();this.g.pressed.clear();
    this.syncSelection();
    this.status.textContent='Walking to '+label+'. The compass shows a direct bearing; follow streets and paths.';
    this.g.ui.announce(this.status.textContent);if(!document.getElementById('map').classList.contains('hidden'))this.g.drawMap();return true;
  }
  clear(arrived=false) {
    const label=this.target?.label;this.target=null;
    this.syncSelection();
    this.status.textContent=arrived?'You reached '+label+'.':'Personal marker cleared.';
    if(arrived)this.g.ui.toast('You reached your marker',label);
    if(!document.getElementById('map').classList.contains('hidden'))this.g.drawMap();
  }
  update() {
    const g=this.g,t=this.target;
    if(t && g.mode==='play' && !g.busy && !g.overlayOpen() && g.space===t.space && Math.hypot(g.player.x-t.x,g.player.z-t.z)<8)this.clear(true);
  }
  draw(c,projection) {
    this.projection=projection;
    c.save();c.strokeStyle='#244f51';c.fillStyle='#244f51';c.lineWidth=2;
    c.font='bold 17px Georgia, serif';c.textAlign='center';c.fillText('N',30,25);
    c.beginPath();c.moveTo(30,35);c.lineTo(30,65);c.moveTo(23,45);c.lineTo(30,35);c.lineTo(37,45);c.stroke();
    const bar=50*projection.s,bottom=c.canvas.height-28;
    c.beginPath();c.moveTo(24,bottom-5);c.lineTo(24,bottom);c.lineTo(24+bar,bottom);c.lineTo(24+bar,bottom-5);c.stroke();
    c.font='13px Georgia, serif';c.fillText('50 m',24+bar/2,bottom-9);c.restore();
    const t=this.target;
    if(!t || t.space!==this.g.space)return;
    const {X,Z}=projection,x=X(t.x),z=Z(t.z);
    c.save();c.strokeStyle='#244f51';c.fillStyle='#f9e9bf';c.lineWidth=3;
    c.beginPath();c.arc(x,z,9,0,Math.PI*2);c.fill();c.stroke();
    c.beginPath();c.moveTo(x-14,z);c.lineTo(x+14,z);c.moveTo(x,z-14);c.lineTo(x,z+14);c.stroke();c.restore();
  }
}
