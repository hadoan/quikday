import React from 'react';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { UserMenu } from '@/components/layout/UserMenu';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useNavigate } from 'react-router-dom';

interface AppHeaderProps {
  /** Title to display in the header (e.g., "Dashboard", "Chat") */
  title: string;
  /** Callback when sidebar toggle is clicked */
  onToggleSidebar: () => void;
  /** Optional action buttons to display before ThemeToggle (e.g., New Task button) */
  actions?: React.ReactNode;
}

const AppHeader: React.FC<AppHeaderProps> = ({ title, onToggleSidebar, actions }) => {
  const { logout } = useKindeAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const redirect = `${window.location.origin}/auth/login`;
      await logout?.(redirect);
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const handleViewProfile = () => {
    console.log('View profile');
    // Navigate to profile page if needed
  };

  const handleEditProfile = () => {
    navigate('/settings/profile');
  };
  return (
    <header className="border-b border-border bg-card px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 flex-shrink-0">
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="md:hidden h-9 w-9"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <img
              src="/logo/logo-light-bg.svg"
              alt="Quik.day"
              className="h-5 sm:h-6 w-auto dark:hidden flex-shrink-0"
            />
            <img
              src="/logo/logo-dark-bg.svg"
              alt="Quik.day"
              className="h-5 sm:h-6 w-auto hidden dark:block flex-shrink-0"
            />
            <span className="hidden sm:inline truncate">{title}</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {actions}
          <ThemeToggle />
          <UserMenu
            onViewProfile={handleViewProfile}
            onEditProfile={handleEditProfile}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
