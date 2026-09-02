'use client';

import PrimaryActionModeSettings from '@/components/account/PrimaryActionModeSettings';

export default function SettingsLayout({ children }) {
  return (
    <>
      <div id="primary-action-mode" data-primary-action-mode-anchor="true">
        <PrimaryActionModeSettings />
      </div>
      {children}
    </>
  );
}
