import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

/**
 * Installation method for app integrations.
 * - 'oauth': Redirect user to OAuth flow (e.g., Google Calendar, LinkedIn)
 * - 'input': Show input dialog for API keys/credentials before installing
 * - 'direct': Install immediately without additional user input
 */
export type InstallMethod = 'oauth' | 'input' | 'direct';

export type InstallAppProps = {
  type: string;
  slug: string;
  variant: string;
  allowedMultipleInstalls: boolean;
  isGlobal?: boolean;
  /** Installation method: 'oauth' for OAuth flow, 'input' for input dialog, 'direct' for immediate install */
  installMethod?: InstallMethod;
  /** 
   * Optional custom OAuth redirect path. If not provided, defaults to convention: `/integrations/{slug}/add`
   * Only used when installMethod is 'oauth'
   */
  oauthPath?: string;
  /** @deprecated Use installMethod='input' instead. For 'input' method: show input dialog before installing */
  isInputDialog?: boolean;
  inputKeys?: { code: string; name: string }[];
  inputDialogTitle?: string;
};

// Simplified InstallApp based on provided sample, mocked locally
export default function InstallApp({
  type,
  slug,
  variant,
  allowedMultipleInstalls,
  isGlobal = false,
  installMethod = 'direct',
  oauthPath,
  isInputDialog = false,
  inputKeys,
  inputDialogTitle,
}: InstallAppProps) {
  const { toast } = useToast();
  const [existingCount, setExistingCount] = useState<number>(0);
  const [installing, setInstalling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const doInstall = async () => {
    setInstalling(true);
    await new Promise((r) => setTimeout(r, 500));
    setExistingCount((c) => c + 1);
    setInstalling(false);
    toast({ title: `Installed ${slug}`, description: `${type} (${variant}) installed.` });
  };

  const doDisconnect = async () => {
    setDisconnecting(true);
    await new Promise((r) => setTimeout(r, 400));
    setExistingCount(0);
    setDisconnecting(false);
    toast({ title: `Disconnected ${slug}` });
  };

  const getApiBaseUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:3000';
    const fromEnv = import.meta.env?.VITE_API_BASE_URL as string | undefined;
    if (fromEnv) return fromEnv;
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  };

  const onClickInstall = () => {
    // Handle OAuth flow - redirect to backend OAuth initiation endpoint
    // Convention: /integrations/{slug}/add
    if (installMethod === 'oauth') {
      const apiBaseUrl = getApiBaseUrl();
      const redirectPath = oauthPath || `/integrations/${slug}/add`;
      window.location.href = `${apiBaseUrl}${redirectPath}`;
      return;
    }

    // Handle input dialog method - show credentials input before installing
    if (installMethod === 'input' && inputKeys && inputKeys.length > 0) {
      setInputOpen(true);
      return;
    }

    // Handle direct install method - install immediately
    void doInstall();
  };

  const handleSaveInputs = async () => {
    // In real app, send inputValues to API before installing
    await doInstall();
    setInputOpen(false);
  };

  const LeftStatus = (
    <Button variant="secondary" size="sm" className="px-2" disabled>
      {existingCount > 0 ? `${existingCount} active` : 'Not installed'}
    </Button>
  );

  // Rendering branches (simplified from sample)
  if (isGlobal || (existingCount > 0 && allowedMultipleInstalls)) {
    return (
      <div className="flex items-center gap-3">
        {LeftStatus}
        {!isGlobal && (
          <Button size="sm" onClick={onClickInstall} disabled={installing}>
            {installing ? 'Installing...' : existingCount > 0 ? 'Install another' : 'Install'}
          </Button>
        )}

        {/* Optional input dialog */}
        <Dialog open={inputOpen} onOpenChange={setInputOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{inputDialogTitle ?? 'Add credentials'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {(inputKeys ?? []).map((k) => (
                <div key={k.code} className="grid gap-2">
                  <Label htmlFor={k.code}>{k.name}</Label>
                  <Input
                    id={k.code}
                    value={inputValues[k.code] ?? ''}
                    onChange={(e) => setInputValues((v) => ({ ...v, [k.code]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setInputOpen(false)}>
                Close
              </Button>
              <Button onClick={handleSaveInputs} disabled={installing}>
                {installing ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (existingCount > 0) {
    return (
      <div className="flex items-center gap-3">
        {LeftStatus}
        <Button variant="destructive" size="sm" onClick={doDisconnect} disabled={disconnecting}>
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {LeftStatus}
      <Button size="sm" onClick={onClickInstall} disabled={installing}>
        {installing ? 'Installing...' : 'Install'}
      </Button>

      {/* Optional input dialog */}
      <Dialog open={inputOpen} onOpenChange={setInputOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inputDialogTitle ?? 'Add credentials'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(inputKeys ?? []).map((k) => (
              <div key={k.code} className="grid gap-2">
                <Label htmlFor={k.code}>{k.name}</Label>
                <Input
                  id={k.code}
                  value={inputValues[k.code] ?? ''}
                  onChange={(e) => setInputValues((v) => ({ ...v, [k.code]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setInputOpen(false)}>
              Close
            </Button>
            <Button onClick={handleSaveInputs} disabled={installing}>
              {installing ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
