export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE'); // concrete instance per connection
export const EMAIL_FACTORY = Symbol('EMAIL_FACTORY'); // selects provider impl
export const EMAIL_REGISTRY = Symbol('EMAIL_REGISTRY'); // map<providerId, class>
