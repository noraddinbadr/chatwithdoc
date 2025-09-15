/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { ChatMessage, MessageSender, CitationSource } from '../types';
import { speakText } from '../services/speechService';
import { FileText, Clipboard, Check, Pencil, RefreshCw, X, ThumbsUp, ThumbsDown, Volume2, Share2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import FeedbackModal from './FeedbackModal';

// Configure marked to use highlight.js for syntax highlighting
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-', // Prefix for CSS classes
} as any); 

interface MessageItemProps {
  message: ChatMessage;
  onEditMessage?: (messageId: string, newText: string) => void;
  onRegenerateResponse?: (messageId: string) => void;
}

const SenderAvatar: React.FC<{ sender: MessageSender }> = ({ sender }) => {
  let avatarChar = '';
  let bgColorClass = '';
  let textColorClass = '';

  if (sender === MessageSender.USER) {
    avatarChar = 'U';
    bgColorClass = 'bg-white/[.12]';
    textColorClass = 'text-white';
  } else if (sender === MessageSender.MODEL) {
    avatarChar = 'AI';
    bgColorClass = 'bg-[#777777]'; 
    textColorClass = 'text-[#E2E2E2]';
  } else { // SYSTEM
    avatarChar = 'S';
    bgColorClass = 'bg-[#4A4A4A]';
    textColorClass = 'text-[#E2E2E2]';
  }

  return (
    <div className={`w-8 h-8 rounded-full ${bgColorClass} ${textColorClass} flex items-center justify-center text-sm font-semibold flex-shrink-0`}>
      {avatarChar}
    </div>
  );
};

const MessageItem: React.FC<MessageItemProps> = ({ message, onEditMessage, onRegenerateResponse }) => {
  const { t } = useLanguage();
  const isUser = message.sender === MessageSender.USER;
  const isModel = message.sender === MessageSender.MODEL;
  const isSystem = message.sender === MessageSender.SYSTEM;
  
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [feedback, setFeedback] = useState<'liked' | 'disliked' | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      const textarea = editInputRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.focus();
      textarea.select();
    }
  }, [isEditing]);
  
  const handleCopy = () => {
    if (!message.text) return;
    navigator.clipboard.writeText(message.text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); 
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleEditSave = () => {
    if (onEditMessage && editText.trim()) {
      onEditMessage(message.id, editText.trim());
    }
    setIsEditing(false);
  };
  
  const handleEditCancel = () => {
    setEditText(message.text);
    setIsEditing(false);
  };

  const handleRegenerate = () => {
    if (onRegenerateResponse) {
      onRegenerateResponse(message.id);
    }
  };

  const handleLike = () => {
    if (feedback) return; // Prevent changing feedback once given
    setFeedback('liked');
    console.log(`Feedback 'liked' received for message: ${message.id}`);
    setShowThankYou(true);
    setTimeout(() => {
      setShowThankYou(false);
    }, 3000);
  };

  const handleDislike = () => {
    if (feedback) return; // Prevent changing feedback once given
    setFeedback('disliked');
    setIsFeedbackModalOpen(true);
  };

  const handleFeedbackSubmit = (reasons: string[]) => {
    console.log(`Feedback 'disliked' submitted for message: ${message.id} with reasons:`, reasons);
    setIsFeedbackModalOpen(false);
    setShowThankYou(true);
    setTimeout(() => {
      setShowThankYou(false);
    }, 3000);
  };

  const handleFeedbackModalClose = () => {
    setIsFeedbackModalOpen(false);
    // If the modal is closed without submitting, reset the feedback state.
    if (feedback === 'disliked') {
        setFeedback(null);
    }
  };

  const handleSpeak = () => {
    if (message.text) {
      speakText(message.text);
    }
  };

  const handleShare = () => {
    if (message.text && navigator.share) {
      navigator.share({
        title: 'AI Assistant Response',
        text: message.text,
      }).catch((error) => console.log('Error sharing:', error));
    } else {
      handleCopy();
    }
  };

  const renderMessageContent = () => {
    const { text, citations } = message;
    const proseClasses = "prose prose-sm prose-invert w-full min-w-0";
    
    // With citations
    if (isModel && citations && citations.length > 0 && text) {
      const sourceMap = new Map<string, number>();
      let sourceCounter = 1;

      const getSourceNumber = (uri: string) => {
        if (!sourceMap.has(uri)) {
          sourceMap.set(uri, sourceCounter++);
        }
        return sourceMap.get(uri);
      };

      const sortedCitations = citations
        .filter(c => c.startIndex !== undefined && c.endIndex !== undefined && c.uri)
        .sort((a, b) => b.startIndex - a.startIndex);

      let processedText = text;
      sortedCitations.forEach(citation => {
        const { startIndex, endIndex, uri } = citation;
        const sourceNum = getSourceNumber(uri);
        const injection = `<sup><a href="${uri}" target="_blank" rel="noopener noreferrer" title="${uri}" class="text-[#79B8FF] no-underline font-semibold">[${sourceNum}]</a></sup>`;
        processedText = processedText.slice(0, endIndex) + injection + processedText.slice(endIndex);
      });

      const sourcesList = Array.from(sourceMap.entries()).map(([uri, num]) => {
        const isUrl = uri.startsWith('http://') || uri.startsWith('https://');
        let displayName = uri;
        try {
            displayName = isUrl ? new URL(uri).hostname : decodeURIComponent(uri);
        } catch (e) { /* use raw uri */ }
        
        return (
          <li key={uri} className="text-[11px] text-[#A8ABB4] truncate">
            <span className="font-mono bg-white/10 text-white rounded-sm px-1 text-[9px] me-1.5">{num}</span>
            {isUrl ? (
                <a href={uri} target="_blank" rel="noopener noreferrer" className="hover:underline break-all text-[#79B8FF]" title={uri}>
                    {displayName}
                </a>
            ) : (
                <span className="text-white break-all" title={uri}>File: {displayName}</span>
            )}
          </li>
        );
      });

      const rawMarkup = marked.parse(processedText) as string;
      
      return (
        <>
          <div className={proseClasses} dangerouslySetInnerHTML={{ __html: rawMarkup }} />
          {sourcesList.length > 0 && (
             <div className="mt-3 pt-3 border-t border-white/10 bg-black/20 rounded-b-md -m-3 px-3 pb-3">
                <h4 className="text-xs font-semibold text-[#A8ABB4] mb-1.5">{t('sources')}</h4>
                <ul className="space-y-1">{sourcesList}</ul>
              </div>
          )}
        </>
      );
    }
    
    // Default rendering for model (no citations)
    if (isModel) {
      const rawMarkup = marked.parse(text || "") as string;
      return <div className={proseClasses} dangerouslySetInnerHTML={{ __html: rawMarkup }} />;
    }
    
    let textColorClass = '';
    if (isUser) {
        textColorClass = 'text-white';
    } else if (isSystem) {
        textColorClass = 'text-[#A8ABB4]';
    } else { // Model loading
        textColorClass = 'text-[#E2E2E2]';
    }
    
    if (!text && message.attachments && message.attachments.length > 0) {
        return null;
    }
    
    return <div className={`whitespace-pre-wrap text-sm ${textColorClass}`}>{text}</div>;
  };
  
  let bubbleClasses = "p-3 rounded-lg shadow w-full relative group "; 

  if (isUser) {
    bubbleClasses += "bg-white/[.12] text-white rounded-es-none";
  } else if (isModel) {
    bubbleClasses += `bg-[rgba(119,119,119,0.10)] border-t border-[rgba(255,255,255,0.04)] backdrop-blur-lg rounded-ss-none`;
  } else { // System message
    bubbleClasses += "bg-[#2C2C2C] text-[#A8ABB4] rounded-ss-none";
  }
  
  const iconButtonClasses = "p-1.5 rounded-md hover:bg-white/10 hover:text-white transition-colors disabled:opacity-70 disabled:hover:bg-transparent";

  return (
    <>
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={handleFeedbackModalClose}
        onSubmit={handleFeedbackSubmit}
      />
      <div className={`flex mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex items-start gap-2 max-w-[95%]`}>
          {!isUser && <SenderAvatar sender={message.sender} />}
          <div className="w-full">
             {isModel && !message.isLoading && <p className="text-sm font-semibold text-[#A8ABB4] mb-1 ms-1">{t('model')}</p>}
             <div className={bubbleClasses}>
               {isEditing && isUser ? (
                <div>
                  <textarea
                    ref={editInputRef}
                    value={editText}
                    onChange={(e) => {
                      setEditText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleEditSave();
                      } else if (e.key === 'Escape') {
                        handleEditCancel();
                      }
                    }}
                    className="w-full bg-[#1E1E1E] text-white placeholder-[#777777] focus:ring-1 focus:ring-blue-500 border border-white/20 resize-none text-sm p-2 rounded-md"
                    rows={1}
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={handleEditCancel} className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors text-xs">{t('cancel')}</button>
                    <button onClick={handleEditSave} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-xs">{t('save')}</button>
                  </div>
                </div>
              ) : (
                <>
                  {isUser && onEditMessage && (
                    <div className="absolute top-2 end-2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setIsEditing(true)}
                        className="p-1 bg-black/20 rounded-md text-gray-400 hover:text-white hover:bg-black/40"
                        aria-label={t('edit')}
                        title={t('edit')}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}

                  {isUser && message.attachments && message.attachments.length > 0 && (
                    <div className={`flex flex-wrap gap-2 ${message.text ? 'mb-2' : ''}`}>
                      {message.attachments.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 bg-black/20 p-1.5 rounded-md text-xs text-white max-w-xs">
                          {file.type.startsWith('image/') ? (
                            <img src={`data:${file.type};base64,${file.data}`} alt={file.name} className="h-10 w-10 rounded-sm object-cover flex-shrink-0" />
                          ) : (
                            <div className="h-10 w-10 flex items-center justify-center bg-black/30 rounded-sm flex-shrink-0">
                              <FileText size={20} />
                            </div>
                          )}
                          <span className="truncate" title={file.name}>{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {message.isLoading && !message.text ? (
                    <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s] ${isUser ? 'bg-white' : 'bg-[#A8ABB4]'}`}></div>
                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s] ${isUser ? 'bg-white' : 'bg-[#A8ABB4]'}`}></div>
                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isUser ? 'bg-white' : 'bg-[#A8ABB4]'}`}></div>
                    </div>
                  ) : (
                    renderMessageContent()
                  )}
                  {message.isLoading && message.text && <span className="blinking-cursor"></span>}
                </>
              )}
              
              {isModel && !message.isLoading && !message.citations && message.urlContext && message.urlContext.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-[rgba(255,255,255,0.1)]">
                  <h4 className="text-xs font-semibold text-[#A8ABB4] mb-1">{t('contextUrlsRetrieved')}</h4>
                  <ul className="space-y-0.5">
                    {message.urlContext.map((meta, index) => {
                      return (
                        <li key={index} className="text-[11px] text-[#A8ABB4]">
                          <a href={meta.retrievedUrl} target="_blank" rel="noopener noreferrer" className="hover:underline break-all text-[#79B8FF]">
                            {meta.retrievedUrl}
                          </a>
                          <span className={`ms-1.5 px-1 py-0.5 rounded-sm text-[9px] ${
                            meta.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS'
                              ? 'bg-white/[.12] text-white'
                              : 'bg-slate-600/30 text-slate-400'
                          }`}>
                            {meta.urlRetrievalStatus.replace('URL_RETRIEVAL_STATUS_', '')}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {isModel && !message.isLoading && message.text && (
                <div className="mt-2 flex items-center justify-start gap-1 text-gray-400">
                  <button onClick={handleCopy} className={iconButtonClasses} title={t('copy')}>
                    {isCopied ? <Check size={16} className="text-green-400" /> : <Clipboard size={16} />}
                  </button>

                  {showThankYou ? (
                     <span className="text-xs text-green-400 px-2 animate-pulse">{t('feedbackThanks')}</span>
                  ) : (
                    <>
                      {feedback !== 'disliked' && (
                        <button onClick={handleLike} className={`${iconButtonClasses} ${feedback === 'liked' ? 'text-blue-400' : ''}`} title={t('like')} disabled={!!feedback}>
                          <ThumbsUp size={16} fill={feedback === 'liked' ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      {feedback !== 'liked' && (
                        <button onClick={handleDislike} className={`${iconButtonClasses} ${feedback === 'disliked' ? 'text-red-400' : ''}`} title={t('dislike')} disabled={!!feedback}>
                          <ThumbsDown size={16} fill={feedback === 'disliked' ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </>
                  )}

                  <button onClick={handleSpeak} className={iconButtonClasses} title={t('readAloud')}>
                    <Volume2 size={16} />
                  </button>
                  <button onClick={handleRegenerate} className={iconButtonClasses} title={t('regenerate')}>
                    <RefreshCw size={16} />
                  </button>
                  <button onClick={handleShare} className={iconButtonClasses} title={t('share')}>
                    <Share2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
          {isUser && <SenderAvatar sender={message.sender} />}
        </div>
      </div>
    </>
  );
};

export default MessageItem;