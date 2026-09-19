/**
 * BSDC — src/features/events/index.ts
 * Purpose : Public surface of the events feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : VenuePicker is re-exported but must stay behind a lazy boundary at the route level: it
 *   pulls Leaflet, and Leaflet has no business in the shell.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { EventCard, modeLabel, type EventCardProps } from './EventCard';
export { EventList, type EventListProps } from './EventList';
export { EventForm, type EventFormProps } from './EventForm';
export { RsvpBar, type RsvpBarProps } from './RsvpBar';
export { VenuePicker, type VenuePickerProps } from './VenuePicker';
