const STORAGE_KEY='arkan:attendance:external:current-import';
export const EXTERNAL_IMPORT_CHANGE_EVENT='arkan:attendance:external:current-import-change';

export function getCurrentExternalImportId(){
  if(typeof window==='undefined')return '';
  try{return window.localStorage.getItem(STORAGE_KEY)||'';}catch{return '';}
}

export function setCurrentExternalImportId(id){
  if(typeof window==='undefined'||!id)return;
  const value=String(id);
  try{window.localStorage.setItem(STORAGE_KEY,value);}catch{}
  try{window.dispatchEvent(new CustomEvent(EXTERNAL_IMPORT_CHANGE_EVENT,{detail:{id:value}}));}catch{}
}

export function clearCurrentExternalImportId(id=''){
  if(typeof window==='undefined')return;
  try{
    const current=window.localStorage.getItem(STORAGE_KEY)||'';
    if(!id||current===String(id)){
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(EXTERNAL_IMPORT_CHANGE_EVENT,{detail:{id:''}}));
    }
  }catch{}
}

export function externalStageHref(path,id){
  return id?`${path}?batch=${encodeURIComponent(String(id))}`:path;
}
