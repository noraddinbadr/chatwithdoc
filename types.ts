/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export enum MessageSender {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
}

export interface Attachment {
  id: string; // Unique ID for each attachment during processing
  name: string;
  type: string; // MIME type
  data?: string; // base64 encoded data, optional during loading
  status: 'loading' | 'loaded' | 'error';
  errorMessage?: string;
}

export interface UrlContextMetadataItem {
  retrievedUrl: string;
  urlRetrievalStatus: string;
}

export interface CitationSource {
  startIndex: number;
  endIndex: number;
  uri: string;
  license?: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: MessageSender;
  timestamp: Date;
  isLoading?: boolean;
  urlContext?: UrlContextMetadataItem[];
  attachments?: Attachment[];
  citations?: CitationSource[];
}

export interface Conversation {
  id: string;
  name: string;
  urls: string[];
  files: Attachment[];
  messages: ChatMessage[];
  lastUpdated: number;
}