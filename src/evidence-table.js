// Keep the full passage and the claims together while the player connects them.
// This view receives no answer key; interpreting the connection stays in dispute.js.
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};

export class EvidenceTable {
  constructor(g,name,claims,card) {
    if(g.evidenceTable)g.evidenceTable.finish(null);
    this.g=g;this.closed=false;this.claims=claims;this.card=card;this.readerName=name;
    this.done=new Promise(resolve=>{this.resolve=resolve;});
    this.root=el('section',null,'evidence-table');
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');
    this.root.setAttribute('aria-labelledby','evidence-title');this.root.setAttribute('aria-describedby','evidence-prompt');
    const sheet=el('div',null,'evidence-sheet'),header=el('header',null,'evidence-header');
    const heading=el('div');heading.append(el('small','Examine the argument','evidence-kicker'));
    const title=el('h2','What does this passage change?');title.id='evidence-title';heading.append(title);
    const back=el('button','Return to the conversation','btn ghost');back.type='button';back.onclick=()=>this.finish(null);
    header.append(heading,back);sheet.append(header);
    const prompt=el('p','Choose the claim it challenges, or say that it supports the view. You can revise a connection after hearing the reply.','evidence-prompt');
    prompt.id='evidence-prompt';sheet.append(prompt);
    const grid=el('div',null,'evidence-grid'),passage=el('article',null,'evidence-passage');
    passage.append(el('small','Your passage','evidence-kicker'));
    passage.append(el('div',(/^[0-9]/.test(card.ref)?'Republic ':'')+card.ref,'evidence-reference'));
    passage.append(el('h3',card.title));
    passage.append(el('p',card.text,'evidence-text'));
    if(card.quote)passage.append(el('blockquote',card.quote));
    passage.append(el('p','Compare the words here with the claim you want to question.','evidence-margin'));
    const link=el('div','↔','evidence-link');link.setAttribute('aria-hidden','true');
    const statements=el('div',null,'evidence-statements');
    statements.append(el('h3',name+'’s claims'));
    this.options=claims.map((text,i)=>{
      const b=el('button',null,'evidence-claim');b.type='button';
      b.append(el('kbd',String(i+1)),el('span',text));
      b.onclick=()=>this.finish(i);statements.append(b);return b;
    });
    const support=el('button',null,'evidence-claim evidence-support');support.type='button';
    support.append(el('kbd',String(claims.length+1)),el('span','None of these. The passage supports the view.'));
    support.onclick=()=>this.finish(claims.length);statements.append(support);this.options.push(support);
    grid.append(passage,link,statements);sheet.append(grid);
    const footer=el('footer',null,'evidence-footer');
    footer.append(el('span','Read · Connect · Hear the reply'),el('small','1–'+this.options.length+' to connect · Tab or arrows to browse · Esc to return'));
    sheet.append(footer);this.root.append(sheet);
    this.abort=new AbortController();
    window.addEventListener('keydown',e=>this.key(e),{capture:true,signal:this.abort.signal});
    g.evidenceTable=this;g.keys.clear();g.pressed.clear();g.cam.drag=false;g.ui.closeDialogue();
    for(const n of g.npcs.values())n.actor.speaking=false;g.player.speaking=false;
    document.body.classList.add('testing-evidence');document.body.append(this.root);
    this.options[0]?.focus({preventScroll:true});g.ui.announce(name+'’s claims and your passage are open for comparison.');
  }
  key(e) {
    if(this.closed || this.g.mode==='paused' || e.ctrlKey || e.altKey || e.metaKey)return;
    const focusable=Array.from(this.root.querySelectorAll('button:not(:disabled)'));
    if(e.code==='KeyP' && !e.repeat){e.preventDefault();e.stopImmediatePropagation();this.g.pause(true);return;}
    if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.finish(null);return;}
    if(e.code==='Tab') {
      const i=focusable.indexOf(document.activeElement),next=e.shiftKey?(i<=0?focusable.length-1:i-1):(i+1)%focusable.length;
      e.preventDefault();e.stopImmediatePropagation();focusable[next].focus();return;
    }
    if(e.code==='ArrowDown' || e.code==='ArrowUp') {
      const i=this.options.indexOf(document.activeElement),step=e.code==='ArrowDown'?1:-1;
      this.options[(i+step+this.options.length)%this.options.length].focus();
    } else if(e.code==='Enter' || e.code==='Space') {
      if(!e.repeat && this.root.contains(document.activeElement))document.activeElement.click();
    } else {
      const digit=/^(?:Digit|Numpad)([1-9])$/.exec(e.code),index=digit?Number(digit[1])-1:-1;
      if(!e.repeat && index>=0 && index<this.options.length)this.finish(index);
    }
    e.preventDefault();e.stopImmediatePropagation();
  }
  finish(index) {
    if(this.closed)return;
    if(index!==null && (!Number.isInteger(index) || index<0 || index>=this.options.length))return;
    this.closed=true;this.abort.abort();this.root.remove();document.body.classList.remove('testing-evidence');
    const g=this.g;if(g.evidenceTable===this)g.evidenceTable=null;
    g.keys.clear();g.pressed.clear();g.canvas.focus({preventScroll:true});
    if(index!==null)g.audio.blip('pick');
    this.resolve(index);
  }
}

export function rememberConnection(state,connection) {
  const list=state.connections || (state.connections=[]);
  const index=list.findIndex(c=>c.who===connection.who && c.card===connection.card && c.claim===connection.claim);
  if(index<0)list.push(connection);else list[index]=connection;
}
