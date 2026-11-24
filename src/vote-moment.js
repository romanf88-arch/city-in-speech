// A small ceremony for the player's judgment, with no score or added wait.
export function voteMoment(g,reader) {
  if(g.ui.auto)return;
  document.querySelector('.vote-moment')?.remove();
  const root=document.createElement('div');root.className='vote-moment'+(reader?'':' withheld');
  root.setAttribute('aria-hidden','true');
  if(g.reduceMotion)root.classList.add('still');
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 100 100');
  const shape=(tag,attributes)=>{const n=document.createElementNS(icon.namespaceURI,tag);for(const [key,value] of Object.entries(attributes))n.setAttribute(key,value);icon.append(n);return n;};
  shape('path',{d:'M30 44 Q23 58 24 72 Q25 91 50 92 Q75 91 76 72 Q77 58 70 44 Z',fill:reader?.color || '#9d7850',stroke:'#d4b87e','stroke-width':'2'});
  shape('ellipse',{cx:'50',cy:'44',rx:'22',ry:'6',fill:'#172b2e',stroke:'#d4b87e','stroke-width':'2'});
  shape('circle',{cx:'50',cy:'17',r:'7',fill:'#e8d29c',stroke:'#b39152','stroke-width':'2',class:'vote-pebble'});
  shape('path',{d:'M26 52 Q22 65 25 78 Q29 92 50 92 Q71 92 75 78 Q78 65 74 52 Q50 62 26 52',fill:reader?.color || '#9d7850'});
  shape('path',{d:'M33 71 Q50 78 67 71 M35 77 Q50 84 65 77',fill:'none',stroke:'#ead7ab','stroke-width':'2',opacity:'.65'});
  const text=document.createElement('div'),small=document.createElement('small'),title=document.createElement('b');
  small.textContent=reader?'Your pebble is cast':'Judgment withheld';
  title.textContent=reader?reader.name+'’s reading':'You kept your pebble';
  text.append(small,title);root.append(icon,text);document.body.append(root);
  setTimeout(()=>root.remove(),3400);
}
