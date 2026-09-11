function safeFilenamePart(value){
  return String(value||'مسير_الرواتب').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_');
}

const COLUMN_WIDTHS={
  employeeNo:16,
  employeeName:28,
  completeDays:14,
  absenceDays:12,
  missingPunches:16,
  basicSalary:16,
  housingAllowance:14,
  transportAllowance:14,
  otherAllowances:14,
  grossSalary:16,
  overtimeAddition:18,
  otherAdditions:14,
  totalAdditions:16,
  absenceDeduction:14,
  timeDeduction:16,
  subscriptionDeduction:18,
  otherDeductions:15,
  totalDeductions:16,
  netPay:18,
};

export async function downloadExternalPayrollExcel(report){
  if(!report?.rows?.length)throw new Error('لا توجد بيانات رواتب لتصديرها.');

  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();
  workbook.creator='Arkan Al Makan';
  workbook.created=new Date();

  const worksheet=workbook.addWorksheet('مسير الرواتب التفصيلي',{
    views:[{rightToLeft:true,state:'frozen',ySplit:4}],
  });
  const columns=report.excelColumns||[];
  const columnCount=columns.length;

  worksheet.mergeCells(1,1,1,columnCount);
  worksheet.getCell(1,1).value='مسير الرواتب التفصيلي';
  worksheet.getCell(1,1).font={bold:true,size:16};
  worksheet.getCell(1,1).alignment={horizontal:'center',vertical:'middle'};
  worksheet.getRow(1).height=26;

  worksheet.mergeCells(2,1,2,columnCount);
  worksheet.getCell(2,1).value=[
    report.meta?.clientName||'',
    `${report.meta?.periodFrom||''} — ${report.meta?.periodTo||''}`,
    `عدد الموظفين: ${report.totals?.employeeCount||0}`,
  ].filter(Boolean).join(' | ');
  worksheet.getCell(2,1).alignment={horizontal:'center',vertical:'middle'};
  worksheet.getCell(2,1).font={size:10};

  worksheet.addRow([]);
  const headerRow=worksheet.addRow(columns.map((column)=>column.label));
  headerRow.height=28;
  headerRow.eachCell((cell)=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};
    cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    cell.border={
      top:{style:'thin',color:{argb:'FFBFC7D1'}},
      bottom:{style:'thin',color:{argb:'FFBFC7D1'}},
      left:{style:'thin',color:{argb:'FFBFC7D1'}},
      right:{style:'thin',color:{argb:'FFBFC7D1'}},
    };
  });

  for(const row of report.rows){
    const excelRow=worksheet.addRow(columns.map((column)=>row[column.key]??(column.type==='text'?'':0)));
    excelRow.height=22;
    columns.forEach((column,index)=>{
      const cell=excelRow.getCell(index+1);
      cell.alignment={
        horizontal:column.key==='employeeName'?'right':'center',
        vertical:'middle',
      };
      if(column.type==='money'){
        cell.numFmt='#,##0.00';
        cell.alignment={horizontal:'right',vertical:'middle'};
      }
      cell.border={
        top:{style:'hair',color:{argb:'FFD9DEE5'}},
        bottom:{style:'hair',color:{argb:'FFD9DEE5'}},
        left:{style:'hair',color:{argb:'FFD9DEE5'}},
        right:{style:'hair',color:{argb:'FFD9DEE5'}},
      };
    });
  }

  const totalRow=worksheet.addRow(columns.map((column,index)=>{
    if(index===0)return 'الإجمالي العام';
    if(index===1)return '';
    return report.totals?.[column.key]??0;
  }));
  totalRow.height=24;
  totalRow.eachCell((cell,index)=>{
    cell.font={bold:true};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0ECEB'}};
    const column=columns[index-1];
    if(column?.type==='money')cell.numFmt='#,##0.00';
  });

  columns.forEach((column,index)=>{
    const worksheetColumn=worksheet.getColumn(index+1);
    worksheetColumn.width=COLUMN_WIDTHS[column.key]||15;
  });
  worksheet.autoFilter={from:{row:4,column:1},to:{row:4,column:columnCount}};

  const buffer=await workbook.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  const period=safeFilenamePart(report.meta?.periodFrom||'');
  const client=safeFilenamePart(report.meta?.clientName||'العميل');
  anchor.href=url;
  anchor.download=`مسير_الرواتب_التفصيلي_${client}_${period}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}
