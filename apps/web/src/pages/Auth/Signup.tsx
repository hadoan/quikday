import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// Replaced SubioLogo with inline Quikday logo images
import { ArrowRight, Sparkles, Zap, Shield, Rocket } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default function SignupPage() {
  const { register, isAuthenticated, isLoading } = useKindeAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/apps');
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-accent/5">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/3 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <Card className="w-full max-w-md relative shadow-elegant border-border/50 backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-6 text-center pb-8">
          <div className="flex justify-center">
            <div className="relative">
              <img
                src="/logo/logo-light-bg.svg"
                alt="Quik.day"
                className="h-12 w-auto dark:hidden"
              />
              <img
                src="/logo/logo-dark-bg.svg"
                alt="Quik.day"
                className="h-12 w-auto hidden dark:block"
              />
              <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-accent animate-pulse" />
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl sm:text-3xl font-bold">Get started free</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Join Quik.day in seconds — no password required
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3 p-4 bg-gradient-to-br from-primary/5 to-accent/5 rounded-lg border border-primary/10">
            <div className="flex items-start gap-2 text-sm">
              <Zap className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Start tracking Reddit leads instantly</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Shield className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">Passwordless & secure authentication</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Rocket className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">No credit card needed to get started</span>
            </div>
          </div>

          <Button
            onClick={() => register()}
            className="w-full h-12 bg-primary-gradient shadow-elegant"
            disabled={isLoading}
          >
            Continue with Email <ArrowRight className="ml-2 w-4 h-4" />
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button
            onClick={() => register()}
            variant="outline"
            className="w-full h-12"
            disabled={isLoading}
          >
            <GoogleIcon />
            <span className="ml-2">Sign up with Google</span>
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Already have an account?</span>
            </div>
          </div>

          <Link to="/auth/login">
            <Button variant="outline" className="w-full h-12">
              Sign in instead
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
