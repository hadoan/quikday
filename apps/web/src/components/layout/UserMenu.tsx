import { useEffect, useMemo, useState } from 'react';
import { User, Settings, LogOut, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';

interface UserMenuProps {
  user?: {
    name: string;
    email: string;
    initials: string;
  };
  onViewProfile?: () => void;
  onEditProfile?: () => void;
  onLogout?: () => void;
}

export const UserMenu = ({ user, onViewProfile, onEditProfile, onLogout }: UserMenuProps) => {
  const { toast } = useToast();
  const { user: authUser, getUserProfile, logout } = useKindeAuth();

  const [profile, setProfile] = useState<any | null>(authUser ?? null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getUserProfile?.();
        if (!cancelled && p) setProfile(p);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getUserProfile]);

  const computed = useMemo(() => {
    const src = user ?? profile ?? {};
    const name = (src as any).name || [
      (src as any).given_name,
      (src as any).family_name,
    ]
      .filter(Boolean)
      .join(' ');
    const email = (src as any).email || '';
    const picture = (src as any).picture as string | undefined;

    const initials = (() => {
      const base = (user?.initials || '').trim();
      if (base) return base;
      const derivedFromName = (name || '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0])
        .join('')
        .toUpperCase();
      if (derivedFromName) return derivedFromName;
      if (email) return email[0]?.toUpperCase() ?? 'U';
      return 'U';
    })();

    return { name: name || email || 'User', email, picture, initials };
  }, [user, profile]);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      // Try provider logout; fallback to toast
      const redirect = `${window.location.origin}/auth/login`;
      void logout?.(redirect).catch(() => {
        toast({
          title: 'Logged out',
          description: 'You have been successfully logged out',
        });
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 h-auto py-2">
          <Avatar className="h-8 w-8">
            {computed.picture && <AvatarImage src={computed.picture} alt={computed.name} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {computed.initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium">{computed.name}</span>
            <span className="text-xs text-muted-foreground">{computed.email}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onViewProfile} className="cursor-pointer">
          <User className="mr-2 h-4 w-4" />
          <span>View Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEditProfile} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          <span>Edit Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
