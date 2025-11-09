import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useBeforeUnload } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UseNavigationWarningOptions {
  /**
   * Condition that determines if navigation should be blocked
   */
  shouldBlock: boolean;
  /**
   * Custom warning message
   */
  message?: string;
  /**
   * Custom dialog title
   */
  title?: string;
}

/**
 * Hook to warn users before navigating away from a page with unsaved work
 * 
 * @param options Configuration for the navigation warning
 * @returns JSX element containing the warning dialog
 */
export function useNavigationWarning({
  shouldBlock,
  message = 'You have an active task in progress. If you navigate away now, any unsaved work and execution state will be lost and cannot be recovered.',
  title = 'Confirm Navigation',
}: UseNavigationWarningOptions) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isNavigatingRef = useRef(false);

  // Use React Router's useBeforeUnload for browser events
  useBeforeUnload(
    useCallback(
      (event) => {
        if (shouldBlock && !isNavigatingRef.current) {
          event.preventDefault();
          return 'You have unsaved changes';
        }
      },
      [shouldBlock]
    )
  );

  // Intercept link clicks to show confirmation dialog
  useEffect(() => {
    if (!shouldBlock) {
      console.log('[NavigationWarning] Not blocking - shouldBlock is false');
      return;
    }

    console.log('[NavigationWarning] Blocking enabled, listening for navigation');

    const handleClick = (e: MouseEvent) => {
      // Check if the click is on a link or inside a link
      let target = e.target as HTMLElement | null;
      let link: HTMLAnchorElement | null = null;

      // Traverse up to find an anchor tag
      while (target && target !== document.body) {
        if (target.tagName === 'A') {
          link = target as HTMLAnchorElement;
          break;
        }
        target = target.parentElement;
      }

      if (!link) return;

      // Check if it's an internal navigation link
      const href = link.getAttribute('href');
      console.log('[NavigationWarning] Link clicked:', href, 'Current:', location.pathname);
      
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      // If navigating to a different path, prevent and show dialog
      if (href !== location.pathname && !isNavigatingRef.current) {
        console.log('[NavigationWarning] Blocking navigation to:', href);
        e.preventDefault();
        e.stopPropagation();
        setPendingNavigation(href);
        setShowDialog(true);
      }
    };

    // Intercept button clicks that might trigger navigation
    const handleButtonClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      
      if (!button) return;

      // Check for onClick handlers that might navigate
      const onClick = button.getAttribute('onclick') || '';
      if (onClick.includes('navigate') || onClick.includes('router.push')) {
        if (!isNavigatingRef.current) {
          // Let the button's onClick handler run but we'll catch navigation attempts
          console.log('[NavigationWarning] Button click detected, monitoring for navigation');
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('click', handleButtonClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('click', handleButtonClick, true);
    };
  }, [shouldBlock, location.pathname]);

  const handleConfirm = useCallback(() => {
    setShowDialog(false);
    isNavigatingRef.current = true;
    
    if (pendingNavigation) {
      // Allow navigation
      setTimeout(() => {
        navigate(pendingNavigation);
        setPendingNavigation(null);
        // Reset the flag after navigation
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 100);
      }, 0);
    }
  }, [pendingNavigation, navigate]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setPendingNavigation(null);
  }, []);

  const DialogComponent = (
    <AlertDialog open={showDialog} onOpenChange={(open) => !open && handleCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-yellow-600 dark:text-yellow-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base pt-2">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            Stay on Page
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive hover:bg-destructive/90"
          >
            Leave Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return DialogComponent;
}
