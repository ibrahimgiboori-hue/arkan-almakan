'use client';

import UISkinBridgeRuntime from '@/components/ui/UISkinBridgeRuntime';
import LegacySemanticBridgeRuntime from '@/components/ui/LegacySemanticBridgeRuntime';
import PortalExperienceRuntime from '@/components/ui/PortalExperienceRuntime';

// DashboardLayout يسلّم البنية الدلالية فقط. تفاصيل الجسور المرئية القديمة والجديدة
// تبقى داخل هذا المحول حتى يمكن استبدال البدلة دون لمس جسم البرنامج.
export default function ActiveDashboardSkinRuntime({ children }) {
  return (
    <UISkinBridgeRuntime>
      <LegacySemanticBridgeRuntime>
        <PortalExperienceRuntime>
          {children}
        </PortalExperienceRuntime>
      </LegacySemanticBridgeRuntime>
    </UISkinBridgeRuntime>
  );
}
