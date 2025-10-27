export type CalendarProviderId = 'google' | 'outlook';

export type CalendarEventId = string;

export type CalendarAttendee = {
  email: string;
  name?: string;
  optional?: boolean;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
};

export type CalendarEvent = {
  id: CalendarEventId;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  timezone?: string;
  attendees?: CalendarAttendee[];
  location?: string;
  htmlLink?: string;
  organizer?: string;
  conference?: { type: 'meet' | 'teams' | 'zoom'; url: string } | null;
};

export type AvailabilityQuery = {
  start: Date;
  end: Date;
  attendees?: string[]; // emails
};

export type AvailabilityResult = {
  available: boolean;
  start: Date;
  end: Date;
  attendees?: string[];
};

