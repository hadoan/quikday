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

export type InstallAppProps = {
  type: string;
  slug: string;
  variant: string;
  allowedMultipleInstalls: boolean;
  isGlobal?: boolean;
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

  const onClickInstall = () => {
    if (isInputDialog && inputKeys && inputKeys.length > 0) {
      setInputOpen(true);
    } else {
      void doInstall();
    }
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
