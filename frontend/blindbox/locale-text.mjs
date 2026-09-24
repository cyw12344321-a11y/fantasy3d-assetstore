let pack=null;
try{const response=await fetch(new URL('./locale-pack.json',import.meta.url),{signal:AbortSignal.timeout(8000)});if(response.ok)pack=await response.json();}catch{}
export const resourcesReady=Boolean(pack&&Array.isArray(pack.languages)&&Array.isArray(pack.messages)&&pack.messages.every(row=>Array.isArray(row)&&row.length===pack.languages.length&&row.every(value=>typeof value==='string'&&value.length)));
const rows=new Map(resourcesReady?pack.messages.map(row=>[row[0],row]):[]);
export function translateText(text,locale){const index=resourcesReady?pack.languages.indexOf(locale):-1;return index>0?(rows.get(text)?.[index]||text):text;}
export function interpolate(template,values){return template.replace(/\{(\w+)\}/g,(token,key)=>Object.hasOwn(values,key)?String(values[key]):token);}
