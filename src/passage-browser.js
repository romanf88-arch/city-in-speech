// Search only the passages the player has collected. No relevance hints or answers.
export function passageBrowser(g, cards, onChoose) {
  const root=document.createElement('section');root.className='passage-browser';
  const label=document.createElement('label');label.textContent='Find a passage';
  const input=document.createElement('input');input.type='search';
  input.placeholder='Search words, title or reference';input.autocomplete='off';
  label.append(input);
  const count=document.createElement('p');count.className='passage-count';
  count.setAttribute('role','status');count.setAttribute('aria-live','polite');
  const wrap=document.createElement('div');wrap.className='cards';
  const pins=()=>Array.isArray(g.flags.evidencePins)?g.flags.evidencePins:[];
  const only=document.createElement('button');only.type='button';only.className='passage-shortlist';
  only.textContent='Shortlist only';only.setAttribute('aria-pressed','false');
  let onlyPinned=false;
  only.onclick=()=>{onlyPinned=!onlyPinned;only.setAttribute('aria-pressed',String(onlyPinned));update();};
  const entries=cards.map(card=>({card,element:g.ui.cardEl(card,!!onChoose),
    text:normalize([card.title,card.text,card.ref,card.quote || '',card.book?'Republic Book '+card.book:''].join(' '))}));
  for(const entry of entries){
    if(onChoose){entry.element.onclick=()=>onChoose(entry.card.id);continue;}
    const pin=document.createElement('button');pin.type='button';pin.className='passage-pin';
    const refresh=()=>{
      const marked=pins().includes(entry.card.id);
      pin.textContent=marked?'Remove from shortlist':'Add to shortlist';
      pin.setAttribute('aria-pressed',String(marked));pin.setAttribute('aria-label',pin.textContent+': '+entry.card.title);
      entry.element.classList.toggle('shortlisted',marked);
    };
    pin.onclick=()=>{
      const marked=pins().includes(entry.card.id);
      g.flags.evidencePins=marked?pins().filter(id=>id!==entry.card.id):[...pins(),entry.card.id];
      refresh();g.save();g.ui.announce(entry.card.title+(marked?' removed from':' added to')+' your shortlist.');
      if(onlyPinned && marked){update();only.focus();}
    };
    entry.element.append(pin);refresh();
  }
  const update=()=>{
    const terms=normalize(input.value).split(/\s+/).filter(Boolean);
    const visible=entries.filter(entry=>(!onlyPinned || pins().includes(entry.card.id)) && terms.every(term=>entry.text.includes(term)));
    if(onChoose)visible.sort((a,b)=>Number(pins().includes(b.card.id))-Number(pins().includes(a.card.id)));
    for(const entry of visible)entry.element.classList.toggle('shortlisted',pins().includes(entry.card.id));
    wrap.replaceChildren(...visible.map(entry=>entry.element));
    count.textContent=visible.length+' of '+cards.length+' collected passages'+(visible.length?'':onlyPinned?' — your shortlist has no matches. Show all passages or try fewer words.':' — try fewer words or a different reference.');
  };
  // Typing J, M, number keys or spaces must not activate game shortcuts.
  // Escape continues to the game's normal journal-close handler.
  input.addEventListener('keydown',e=>{if(e.code!=='Escape')e.stopPropagation();});
  input.addEventListener('focus',()=>{g.keys.clear();g.pressed.clear();});
  input.addEventListener('input',update);
  root.append(label,only,count,wrap);update();return root;
}
function normalize(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[’‘]/g,"'").replace(/[–—]/g,'-');
}
