/**
 * BSDC — src/features/messenger/index.ts
 * Purpose : Public surface of the messenger feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { ChatPanel, type ChatPanelProps } from './ChatPanel';
export {
  ConversationList,
  type ConversationListProps,
  type ConversationRow,
} from './ConversationList';
export { MessageBubble, type MessageBubbleProps } from './MessageBubble';
export { TypingIndicator, type TypingIndicatorProps } from './TypingIndicator';
export { useUnreadConversationCount } from './useUnreadConversations';
