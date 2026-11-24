const KEY='city-in-speech-reading';
const RATES={normal:95,fast:160,instant:Infinity};
export class ReadingSettings {
  constructor(g) {
    this.speed='normal';this.size='normal';this.controls={};
    try{const saved=JSON.parse(localStorage.getItem(KEY));if(Object.hasOwn(RATES,saved?.speed))this.speed=saved.speed;if(['normal','large','larger'].includes(saved?.size))this.size=saved.size;}catch{/* Use defaults without storage. */}
    const field=document.createElement('fieldset');field.className='reading-settings';
    const legend=document.createElement('legend');legend.textContent='Reading';field.append(legend);
    const build=(label,items,key)=>{
      const row=document.createElement('label');row.textContent=label;
      const select=document.createElement('select');
      for(const [value,text] of items){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
      select.value=this[key];select.onchange=()=>this.set(key,select.value);this.controls[key]=select;row.append(select);field.append(row);
    };
    build('Dialogue text',[['normal','Normal reveal'],['fast','Fast reveal'],['instant','Show instantly']],'speed');
    build('Reading text size',[['normal','Normal'],['large','Large'],['larger','Larger']],'size');
    const panel=document.querySelector('#pause .panel');panel.insertBefore(field,document.getElementById('restartAsk'));
    this.apply();
  }
  get rate(){return RATES[this.speed];}
  set(key,value) {
    if(key==='speed' && Object.hasOwn(RATES,value))this.speed=value;
    else if(key==='size' && ['normal','large','larger'].includes(value))this.size=value;
    else return;
    this.apply();try{localStorage.setItem(KEY,JSON.stringify({speed:this.speed,size:this.size}));}catch{/* Optional preferences. */}
  }
  apply(){document.body.style.setProperty('--reading-scale',String({normal:1,large:1.15,larger:1.3}[this.size]));for(const key of ['speed','size'])if(this.controls[key])this.controls[key].value=this[key];}
}
