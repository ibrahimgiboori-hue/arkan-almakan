const STORAGE_KEY='arkan:attendance:external:current-import';

export function getCurrentExternalImportId(){
  if(typeof window==='undefined')return '';
  try{return window.localStorage.getItem(STORAGE_KEY)||'';}catch{return '';}
}

export function setCurrentExternalImportId(id){
  if(typeof window==='undefined'||!id)return;
  try{window.localStorage.setItem(STORAGE_KEY,String(id));}catch{}
}

export function clearCurrentExternalImportId(id=''){
  if(typeof window==='undefined')return;
  try{
    const current=window.localStorage.getItem(STORAGE_KEY)||'';
    if(!id||current===String(id))window.localStorage.removeItem(STORAGE_KEY);
  }catch{}
}

export function externalStageHref(path,id){
  return id?`${path}?batch=${encodeURIComponent(String(id))}`:path;
}
