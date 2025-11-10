import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { KindeProvider } from '@kinde-oss/kinde-auth-react';
import Login from './pages/Auth/Login';
import Signup from './pages/Auth/Signup';
import Callback from './pages/Auth/Callback';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Apps from './pages/Apps';
import RunsPage from './pages/Runs';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ApiAuthProvider from './apis/ApiAuthProvider';
import { syncUserAfterRegister } from '@/apis/syncUser';
import ProfileSettingsPage from './pages/Settings/Profile';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <KindeProvider
          clientId={import.meta.env.VITE_KINDE_CLIENT_ID as string}
          domain={import.meta.env.VITE_KINDE_ISSUER_URL as string}
          redirectUri={import.meta.env.VITE_KINDE_REDIRECT_URI as string}
          audience={import.meta.env.VITE_KINDE_AUDIENCE as string}
          scope="openid profile email offline"
          callbacks={{
            onEvent: (event, _state, ctx) => {
              // Ensure DB user is provisioned on both signup and login
              if (event !== 'register' && event !== 'login') return;
              void syncUserAfterRegister({
                getAccessToken: ctx.getAccessToken,
                getUserProfile: ctx.getUserProfile,
                expectedAudience: import.meta.env.VITE_KINDE_AUDIENCE as string | undefined,
              });
            },
          }}
        >
          <ApiAuthProvider />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/apps"
                element={
                  <ProtectedRoute>
                    <Apps />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/runs"
                element={
                  <ProtectedRoute>
                    <RunsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/profile"
                element={
                  <ProtectedRoute>
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />
              {/* Auth routes */}
              <Route path="/auth/login" element={<Login />} />
              <Route path="/auth/signup" element={<Signup />} />
              <Route path="/auth/callback" element={<Callback />} />
              <Route path="/callback" element={<Callback />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </KindeProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
