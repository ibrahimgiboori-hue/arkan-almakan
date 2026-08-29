'use client';

import PrimaryActionModeSettings from '@/components/account/PrimaryActionModeSettings';

export default function SettingsLayout({ children }) {
  return (
    <>
      <PrimaryActionModeSettings />
      {children}
    </>
  );
}
