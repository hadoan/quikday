# Custom Hooks

## useNavigationWarning

A React hook that prevents users from accidentally navigating away from a page with active work, displaying a professional confirmation dialog.

### Features

- ✅ Blocks navigation when conditions are met
- ✅ Displays professional warning dialog with custom messaging
- ✅ Handles browser events (tab close, refresh)
- ✅ Handles React Router navigation
- ✅ Fully customizable title and message
- ✅ Integrates with shadcn/ui AlertDialog component

### Usage

```tsx
import { useNavigationWarning } from '@/hooks/useNavigationWarning';

function MyComponent() {
  const [hasUnsavedWork, setHasUnsavedWork] = useState(false);

  const navigationWarningDialog = useNavigationWarning({
    shouldBlock: hasUnsavedWork,
    title: 'Unsaved Changes',
    message: 'You have unsaved changes. Are you sure you want to leave?',
  });

  return (
    <>
      {navigationWarningDialog}
      {/* Your component content */}
    </>
  );
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `shouldBlock` | `boolean` | Yes | - | Condition that determines if navigation should be blocked |
| `title` | `string` | No | `'Confirm Navigation'` | Custom dialog title |
| `message` | `string` | No | Default warning message | Custom warning message displayed in the dialog |

### Example: Chat Page

The hook is used in the chat page (`/apps/web/src/pages/Index.tsx`) to warn users when they have:
- An active task being executed
- Pending questions to answer
- A task waiting for approval

```tsx
const hasActiveWork = Boolean(
  activeRun && 
  (activeRun.status === 'executing' || 
   activeRun.status === 'planning' || 
   activeRun.status === 'scheduled' ||
   activeRun.status === 'awaiting_approval' ||
   activeRun.status === 'awaiting_input' ||
   isWaitingForResponse ||
   questions.length > 0)
);

const navigationWarningDialog = useNavigationWarning({
  shouldBlock: hasActiveWork,
  title: 'Leave Active Task?',
  message: 'You have an active task in progress. If you navigate away now, any unsaved work and execution state will be lost and cannot be recovered. Are you sure you want to leave?',
});
```

### Return Value

Returns a JSX element containing the AlertDialog component. Simply include it in your component's JSX:

```tsx
return (
  <>
    {navigationWarningDialog}
    {/* Rest of your component */}
  </>
);
```

### Technical Details

- Uses React Router's `UNSAFE_NavigationContext` for navigation blocking
- Implements custom blocker function compatible with React Router v6
- Listens to browser's `beforeunload` event for tab close/refresh
- Gracefully handles navigation retry after user confirmation
- Resets state when navigation is completed

### Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Browser-level warnings may vary slightly based on browser implementation
- Custom message in `beforeunload` may not be displayed in all browsers (browser security policy)
