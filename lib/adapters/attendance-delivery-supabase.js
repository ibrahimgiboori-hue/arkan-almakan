import { supabase } from '@/lib/supabase';

const DELIVERY_FIELDS='id,client_name,period_from,period_to,file_name,storage_bucket,storage_path,retention_days,expires_at,created_at';

export async function listAttendanceDeliveryFiles(){
  const query=await supabase.from('hr_attendance_delivery_files')
    .select(DELIVERY_FIELDS)
    .order('created_at',{ascending:false});
  if(query.error)throw query.error;
  return query.data||[];
}

export async function createAttendanceDeliveryDownloadUrl(row,{expiresIn=300}={}){
  if(!row?.storage_path)throw new Error('مسار ملف التسليم غير موجود.');
  const query=await supabase.storage
    .from(row.storage_bucket||'workspace-files')
    .createSignedUrl(row.storage_path,expiresIn,{download:row.file_name});
  if(query.error)throw query.error;
  return query.data?.signedUrl||'';
}

export async function deleteAttendanceDeliveryFile(row){
  if(!row?.id||!row?.storage_path)throw new Error('بيانات ملف التسليم غير مكتملة.');
  const storage=await supabase.storage
    .from(row.storage_bucket||'workspace-files')
    .remove([row.storage_path]);
  if(storage.error)throw storage.error;

  const record=await supabase.from('hr_attendance_delivery_files').delete().eq('id',row.id);
  if(record.error)throw record.error;
  return true;
}

export const attendanceDeliverySupabaseAdapter=Object.freeze({
  list:listAttendanceDeliveryFiles,
  createDownloadUrl:createAttendanceDeliveryDownloadUrl,
  remove:deleteAttendanceDeliveryFile,
});
