// Keep essential settings compact; sound and music remain on the main screen.
export function setupPausePanels() {
  const panel=document.querySelector('#pause .panel');
  for(const field of panel.querySelectorAll('.presentation-settings,.reading-settings')){
    const legend=field.querySelector('legend'),label=legend.textContent;
    const group=document.createElement('details');group.className='pause-settings-group';
    const summary=document.createElement('summary');summary.textContent=label;
    field.setAttribute('aria-label',label);legend.remove();field.before(group);group.append(summary,field);
  }
}
