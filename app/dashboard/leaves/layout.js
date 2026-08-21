import LeaveParallelActionsPanel from '@/components/LeaveParallelActionsPanel';

export default function LeavesLayout({ children }) {
  return (
    <>
      <LeaveParallelActionsPanel />
      {children}
    </>
  );
}
