import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
// Replaced SubioLogo with inline Quikday logo images
import { Loader2 } from 'lucide-react';

/**
 * Callback page to handle authentication redirect from Kinde
 * This is shown briefly while processing the auth token
 */
export default function CallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useKindeAuth();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate('/', { replace: true });
    } else {
      navigate('/auth/login', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-md relative shadow-elegant border-border/50 backdrop-blur-sm bg-card/95">
        <CardHeader className="text-center pt-12 pb-8">
          <div className="flex justify-center mb-6">
            <img src="/logo/logo-light-bg.svg" alt="Quik.day" className="h-12 w-auto dark:hidden" />
            <img src="/logo/logo-dark-bg.svg" alt="Quik.day" className="h-12 w-auto hidden dark:block" />
          </div>
        </CardHeader>
        
        <CardContent className="text-center pb-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Completing authentication...</h3>
              <p className="text-sm text-muted-foreground">
                Please wait while we securely sign you in
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
