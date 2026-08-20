export const PORTAL_ATTENDANCE_STATUSES=[
  ['absent','غياب'],
  ['half','نصف يوم'],
  ['full','حضور كامل'],
];

export const PORTAL_ATTENDANCE_LABEL=Object.fromEntries(PORTAL_ATTENDANCE_STATUSES);

export function shiftIsoDate(iso,days){
  const value=new Date(`${iso}T12:00:00`);
  value.setDate(value.getDate()+days);
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
}

export function buildPeriodWorkers(rows,classLabel=value=>value){
  const workers=new Map();
  for(const row of rows||[]){
    if(!workers.has(row.laborer_id)){
      workers.set(row.laborer_id,{
        id:row.laborer_id,
        name:row.full_name,
        trade:row.trade||classLabel(row.labor_class),
        days:{},
      });
    }
    workers.get(row.laborer_id).days[row.work_date]=row.attendance_status||'absent';
  }
  return [...workers.values()];
}
