// A visual companion to the reciter and bronze-worker's calls. Timing and scoring remain with the activity.
export class RhythmCue {
  constructor(g, {title, action, beats, start, gap, window, tap}) {
    Object.assign(this,{g,start,gap,window});
    const root=this.root=document.createElement('section');root.className='rhythm-cue';root.dataset.modal='rhythm';
    root.setAttribute('role','group');root.setAttribute('aria-label',title);
    const heading=document.createElement('h2');heading.textContent=title;
    this.status=document.createElement('p');this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
    const row=document.createElement('div');row.className='rhythm-beats';row.setAttribute('aria-hidden','true');
    this.pips=Array.from({length:beats},(_,i)=>{const pip=document.createElement('span');pip.textContent=String(i+1);row.append(pip);return pip;});
    this.button=document.createElement('button');this.button.className='btn';this.button.textContent=action;this.button.onclick=tap;
    const help=document.createElement('small');help.textContent='Space or tap the button on each call · P pauses';
    root.append(heading,this.status,row,this.button,help);document.body.append(root);
    this.previousFocus=document.activeElement;this.button.focus();
  }
  update(now, hits) {
    let current=-1;
    this.pips.forEach((pip,i)=>{
      const delta=now-(this.start+i*this.gap);
      const state=hits[i]?'hit':delta>this.window?'missed':Math.abs(delta)<this.window?'call':'waiting';
      if(state==='call' && current<0)current=i;
      pip.dataset.state=state;
    });
    const count=hits.filter(Boolean).length;
    const text=current>=0?'Now · beat '+(current+1)+' of '+hits.length:now<this.start-this.window?'Listen for the first call.':count+' of '+hits.length+' in time';
    if(this.status.textContent!==text)this.status.textContent=text;
  }
  close() {
    this.root.remove();
    if(this.g.mode==='play'){
      if(this.previousFocus?.isConnected && this.previousFocus.getClientRects().length)this.previousFocus.focus({preventScroll:true});
      else this.g.canvas.focus();
    }
    this.g.keys.clear();this.g.pressed.clear();
  }
}
