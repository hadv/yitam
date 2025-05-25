import { Socket } from 'socket.io-client';
import { DefaultEventsMap } from '@socket.io/component-emitter';

export interface AnthropicError {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

export interface ErrorResponse {
  type: string;
  message?: string;
  details?: {
    retryAfter?: number;
  };
  retryAfter?: number;
}

export interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
  timestamp?: number;
  error?: {
    type: 'rate_limit' | 'credit_balance' | 'other';
    message: string;
    retryAfter?: number;
  };
  personaId?: string;
}

export interface AnthropicErrorResponse {
  request_id: string;
  error: {
    type: string;
    error: {
      type: string;
      message: string;
    };
  };
}

export interface ServerError {
  type: 'rate_limit' | 'credit_balance' | 'other';
  message: string;
  details?: {
    retryAfter?: number;
  };
}

export interface UserData {
  email: string;
  name: string;
  picture: string;
}

// Type for any kind of message object (union type)
export type AnyMessage = Message | import('./../db/ChatHistoryDB').Message | Record<string, any>;

// Type for socket
export type ChatSocket = Socket<DefaultEventsMap, DefaultEventsMap> | null;

// Type checking helper for message object type
export const isUIMessage = (msg: any): msg is Message => {
  return msg && typeof msg.isBot === 'boolean' && typeof msg.text === 'string';
};

export const isDBMessage = (msg: any): msg is import('./../db/ChatHistoryDB').Message => {
  return msg && typeof msg.role === 'string' && typeof msg.content === 'string';
}; 