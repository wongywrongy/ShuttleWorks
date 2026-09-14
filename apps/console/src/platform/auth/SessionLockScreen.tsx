import { Button } from '@scheduler/design-system';
import { useAuth } from '../../context/AuthContext';
import { LoginPage } from './LoginPage';
import { MfaCeremony } from './MfaCeremony';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { PageBody } from '../../components/control-plane/PageBody';

export function SessionLockScreen() {
  const { user, lockReason, refresh, cancelReauthentication } = useAuth();
  return <Dialog open onClose={() => { if (lockReason === 'reauth') cancelReauthentication(); }}
    className="fixed inset-0 z-[100] overflow-auto bg-background text-foreground">
    <DialogPanel className="min-h-screen">
    <DialogTitle className="sr-only">Session verification</DialogTitle>
    <p role="status" className="px-6 pt-6 text-center text-sm text-muted-foreground">
      Your unsent changes are kept in this tab.
    </p>
    {user?.isBootstrap ? <PageBody variant="form" className="space-y-4">
      <h1 className="text-xl font-semibold">Reconnect to continue</h1>
      <Button onClick={() => void refresh()}>Retry connection</Button>
    </PageBody> : lockReason === 'reauth' && user ? <PageBody variant="form" className="flex flex-col items-center gap-4">
      <MfaCeremony user={user} onComplete={refresh} />
      <Button variant="ghost" onClick={cancelReauthentication}>Cancel verification</Button>
    </PageBody> : <LoginPage locked />}
    </DialogPanel>
  </Dialog>;
}
