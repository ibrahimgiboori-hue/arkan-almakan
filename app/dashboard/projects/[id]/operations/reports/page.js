'use client';
import { useParams } from 'next/navigation';
import TimesheetReportCenter from '@/components/timesheet/TimesheetReportCenter';

export default function ProjectTimesheetReportsPage(){
  const { id } = useParams();
  return <TimesheetReportCenter fixedProjectId={id}/>;
}
