import SignatureAppSceneRuntime from '@/components/ui/SignatureAppSceneRuntime';
import SignatureProjectSceneRuntime from '@/components/ui/SignatureProjectSceneRuntime';
import { ACTIVE_UI_SKIN_KEY } from '@/lib/ui-active-skin';
import { uiSkinUsesRuntime } from '@/lib/ui-skin-registry';

// RootLayout يعرف «جلدًا نشطًا» فقط، ولا يعرف تفاصيل بدلة بعينها.
// أي runtime خاص ببدلة مستقبلية يظل هنا في طبقة العرض القابلة للاستبدال.
export default function ActiveUISkinRuntime() {
  if (!uiSkinUsesRuntime(ACTIVE_UI_SKIN_KEY, 'signature-scenes')) return null;

  return (
    <>
      <SignatureAppSceneRuntime />
      <SignatureProjectSceneRuntime />
    </>
  );
}
