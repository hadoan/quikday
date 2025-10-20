import React from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// Replaced SubioLogo with inline Quikday logo images
import { AlertCircle, ArrowLeft } from 'lucide-react';

/**
 * Error page for authentication failures
 */
export default function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const errorMessage = searchParams.get('message') || 'An unexpected error occurred during authentication';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-destructive/5">
      <Card className="w-full max-w-md relative shadow-elegant border-border/50 backdrop-blur-sm bg-card/95">
        <CardHeader className="text-center space-y-6 pb-8">
          <div className="flex justify-center">
            <img src="/logo/logo-light-bg.svg" alt="Quik.day" className="h-12 w-auto dark:hidden" />
            <img src="/logo/logo-dark-bg.svg" alt="Quik.day" className="h-12 w-auto hidden dark:block" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-bold">
              Authentication Failed
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              We couldn't complete your sign in
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
            <p className="text-sm text-destructive">
              {decodeURIComponent(errorMessage)}
            </p>
          </div>

          <div className="space-y-3">
            <Button 
              onClick={() => navigate('/auth/login')}
              className="w-full h-12 bg-primary-gradient text-sm sm:text-base font-medium"
            >
              Try Again
            </Button>
            
            <Link to="/">
              <Button 
                variant="outline"
                className="w-full h-12 text-sm sm:text-base"
              >
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back to Home
              </Button>
            </Link>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            Need help? Contact support at{' '}
            <a href="mailto:support@quik.day" className="text-primary hover:underline">
              support@quik.day
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
