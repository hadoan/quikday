export const CALENDAR_SERVICE = Symbol('CALENDAR_SERVICE'); // concrete instance per connection
export const CALENDAR_FACTORY = Symbol('CALENDAR_FACTORY'); // selects provider impl
export const CALENDAR_REGISTRY = Symbol('CALENDAR_REGISTRY'); // map<providerId, class>
