import {DISTRICTS} from './places.js';
const NOTES={
  harbor:{at:[0,47],text:'Ships, cargo and new arrivals share the quay. The main street leads inland to the market.'},
  street:{at:[0,26],text:'The short climb from the quay opens onto the square. Cargo and traders move through this approach.'},
  agora:{at:[0,-4],text:'Work, trade and public argument meet around the square. The covered stoa stands along its west side.'},
  west:{at:[-66,-46],text:'Courtyards and working lanes lie behind the public square. Cephalus lives in this part of town.'},
  east:{at:[62,-24],text:'Kilns, workshops and the shrine sit among the eastern lanes.'},
  road:{at:[0,-56],text:'This street links the square to the north gate. Beyond the wall, the ground rises into the fields.'},
  fields:{at:[0,-99],text:'The road leaves the town wall and runs between cultivated ground. A branch turns east toward the surveyor’s stakes.'},
  hill:{at:[-30,-206],text:'The road climbs toward the stone seats, the pond and the cave mouth.'},
  stakes:{at:[130,-160],text:'Surveyor’s stakes outline a possible city. Walk through Archedemos’s imagined streets, or examine his model. The real ground remains unbuilt.'},
};
export class FieldNotes {
  constructor(g){this.g=g;}
  visit(district) {
    const g=this.g;
    if(!district || !NOTES[district.id] || g.mode!=='play' || g.space!=='world' || g.busy || g.frozen)return;
    const seen=Array.isArray(g.flags.exploredDistricts)?g.flags.exploredDistricts:[];
    if(seen.includes(district.id))return;
    if(g.overlayOpen())return;
    g.flags.exploredDistricts=[...seen,district.id];
    if(district.id!=='harbor' && g.time>10)g.ui.toast(district.name,'Journal → Places','A place in your field notes');
  }
  render() {
    const root=document.createElement('section');root.className='field-notes';
    const intro=document.createElement('p');intro.textContent='Places you have walked through. Set a marker to revisit one at your own pace.';root.append(intro);
    const seen=Array.isArray(this.g.flags.exploredDistricts)?this.g.flags.exploredDistricts:[];
    if(!seen.length){intro.textContent='Your field notes will fill as you explore the harbor and the surrounding country.';return root;}
    const grid=document.createElement('div');grid.className='field-note-grid';root.append(grid);
    for(const id of seen){
      const district=DISTRICTS.find(d=>d.id===id),note=NOTES[id];if(!district || !note)continue;
      const card=document.createElement('article');card.className='field-note';
      const heading=document.createElement('h4');heading.textContent=district.name;
      const sub=document.createElement('small');sub.textContent=district.sub;
      const text=document.createElement('p');text.textContent=note.text;
      const button=document.createElement('button');button.className='btn ghost';button.textContent='Set a walking marker';
      button.disabled=this.g.space!=='world';
      if(button.disabled)button.title='Return to the Piraeus to follow this marker.';
      button.onclick=()=>{if(!this.g.navigation)return;this.g.navigation.set(...note.at,district.name,'world');this.g.toggle('journal');this.g.ui.toast('Your marker is set',district.name);};
      card.append(heading,sub,text,button);grid.append(card);
    }
    return root;
  }
}
