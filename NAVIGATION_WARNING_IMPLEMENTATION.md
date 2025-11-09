# Navigation Warning Implementation Summary

## Overview

Implemented a professional navigation warning system that prevents users from accidentally leaving the chat screen when they have active work in progress.

## Files Created

### 1. `/apps/web/src/hooks/useNavigationWarning.tsx`
A reusable React hook that:
- Blocks navigation when specified conditions are met
- Shows a professional confirmation dialog
- Handles both React Router navigation and browser events (tab close/refresh)
- Fully customizable with title and message options

**Key Features:**
- ✅ Custom blocker implementation for React Router v6
- ✅ Browser `beforeunload` event handling
- ✅ Professional AlertDialog UI using shadcn/ui
- ✅ Warning icon with yellow accent color
- ✅ Clear action buttons ("Stay on Page" / "Leave Anyway")
- ✅ Destructive styling for the "Leave" action to emphasize severity

### 2. `/apps/web/src/hooks/README.md`
Comprehensive documentation for the hook including:
- Usage examples
- Parameter descriptions
- Technical implementation details
- Browser compatibility notes

## Files Modified

### `/apps/web/src/pages/Index.tsx`

**Changes Made:**
1. **Import Added:**
   ```tsx
   import { useNavigationWarning } from '@/hooks/useNavigationWarning';
   ```

2. **State Detection Logic:**
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
   ```

3. **Hook Usage:**
   ```tsx
   const navigationWarningDialog = useNavigationWarning({
     shouldBlock: hasActiveWork,
     title: 'Leave Active Task?',
     message: 'You have an active task in progress. If you navigate away now, any unsaved work and execution state will be lost and cannot be recovered. Are you sure you want to leave?',
   });
   ```

4. **Dialog Rendering:**
   ```tsx
   return (
     <>
       {navigationWarningDialog}
       <div className="flex h-screen w-full bg-background">
         {/* ... rest of component */}
       </div>
     </>
   );
   ```

## User Experience

### When Navigation is Blocked

The user will see a professional dialog with:

**Title:** "Leave Active Task?" (with warning icon)

**Message:** "You have an active task in progress. If you navigate away now, any unsaved work and execution state will be lost and cannot be recovered. Are you sure you want to leave?"

**Actions:**
- **Stay on Page** (default, outlined button)
- **Leave Anyway** (destructive red button)

### When Blocked

Navigation is blocked when the user has:
1. A task actively executing
2. A task in planning phase
3. A scheduled task
4. A task awaiting approval
5. A task awaiting input
6. Waiting for a backend response
7. Unanswered questions in the UI

### Browser Events

When the user tries to:
- Close the browser tab
- Refresh the page
- Navigate to a different URL

They will see:
1. **Browser-level warning** (native browser dialog for tab close/refresh)
2. **Custom dialog** (for React Router navigation within the app)

## Technical Implementation

### Navigation Blocking Strategy

1. **React Router Navigation:**
   - Uses `UNSAFE_NavigationContext` to access the history navigator
   - Implements custom blocker function that intercepts navigation
   - Shows custom AlertDialog before allowing navigation
   - Allows retry after user confirmation

2. **Browser Events:**
   - Listens to `beforeunload` event
   - Sets `event.returnValue` to trigger browser's native warning
   - Modern browsers may not show custom message (security policy)

### State Management

- Tracks dialog visibility state
- Stores navigation transition for retry
- Manages confirmation state to allow navigation after approval
- Resets state when location changes

## Testing Recommendations

1. **Test Navigation Scenarios:**
   - Click dashboard link with active task → should show dialog
   - Click apps link with active task → should show dialog
   - Click settings with active task → should show dialog
   - Navigate with completed task → should NOT show dialog

2. **Test Browser Events:**
   - Try closing tab with active task → should show browser warning
   - Try refreshing page with active task → should show browser warning
   - Close tab with no active task → should close without warning

3. **Test User Actions:**
   - Click "Stay on Page" → should remain on chat
   - Click "Leave Anyway" → should navigate away
   - Press Escape → should close dialog and stay

## Future Enhancements

Potential improvements:
- Track specific unsaved data types (draft messages, partial answers)
- Different warning messages based on work type
- Option to save state before navigation
- Temporary state persistence across navigation
- Analytics tracking for abandonment rates

## Compliance

- Follows project's TypeScript and React best practices
- Uses existing shadcn/ui component library
- Maintains consistent styling with the application
- Professional, user-friendly messaging
- No breaking changes to existing functionality
