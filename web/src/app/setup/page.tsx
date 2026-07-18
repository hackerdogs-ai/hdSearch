import { Brand } from '@/components/brand';
import { SetupWizard } from '@/components/setup-wizard';

export const dynamic = 'force-dynamic';

// First-run infrastructure setup — an OS-installer-style wizard that walks the operator
// through connecting HD-Search to its datastores and providers. Reached automatically
// (via middleware) until setup is marked complete; afterwards admins edit endpoints from
// the admin area (SetupWizard in edit mode).
export default function SetupPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-50 to-ink-50 px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <SetupWizard />
      </div>
    </div>
  );
}
