/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { ChatMessage, MessageSender, Conversation, Attachment, CitationSource, UrlContextMetadataItem } from './types';
import { generateContentStreamWithUrlContext, getInitialSuggestions, getSummary } from './services/geminiService';
import { speakText } from './services/speechService';
import KnowledgeBaseManager from './components/KnowledgeBaseManager';
import ChatInterface from './components/ChatInterface';
import { X, Clipboard, Check } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';

// Helper function to load and initialize state from localStorage
// FIX: Update the type definition for the translation function 't' to allow for replacements.
const loadInitialState = (t: (key: string, replacements?: { [key: string]: string | number }) => string): { conversations: Conversation[], activeId: string } => {
    let loadedConversations: Conversation[] = [];
    let activeId = '';

    try {
        const savedData = localStorage.getItem('conversations');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            if (Array.isArray(parsed) && parsed.length > 0) {
                loadedConversations = parsed.map((conv: any) => ({
                    ...conv,
                    files: (conv.files || []).filter((f: Attachment) => f.status === 'loaded' && f.data),
                    messages: (conv.messages || []).map((msg: ChatMessage) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp),
                        attachments: (msg.attachments || []).filter((a: Attachment) => a.status === 'loaded' && a.data),
                    })),
                }));
            }
        }
    } catch (error) {
        console.error("Failed to load conversations from localStorage", error);
    }

    if (loadedConversations.length === 0) {
        const defaultId = `conv-${Date.now()}`;
        const defaultName = t('myFirstConversation');
        const defaultConversation: Conversation = {
            id: defaultId,
            name: defaultName,
            urls: [],
            files: [],
            lastUpdated: Date.now(),
            messages: [{
                id: `system-welcome-${defaultId}`,
                text: t('welcomeMessage', { conversationName: defaultName }),
                sender: MessageSender.SYSTEM,
                timestamp: new Date(),
            }]
        };
        loadedConversations.push(defaultConversation);
        activeId = defaultId;
    } else {
        // Sort conversations by last updated, descending
        loadedConversations.sort((a, b) => b.lastUpdated - a.lastUpdated);
        const savedActiveId = localStorage.getItem('activeConversationId');
        if (savedActiveId && loadedConversations.some(c => c.id === savedActiveId)) {
            activeId = savedActiveId;
        } else {
            activeId = loadedConversations[0].id;
        }
    }

    return { conversations: loadedConversations, activeId };
};

const App: React.FC = () => {
  const { t, lang } = useLanguage();
  const [initialState] = useState(() => loadInitialState(t));
  const [conversations, setConversations] = useState<Conversation[]>(initialState.conversations);
  const [activeConversationId, setActiveConversationId] = useState<string>(initialState.activeId);
  const [maxContextItems, setMaxContextItems] = useState<number>(() => {
    try {
      const savedMaxItems = localStorage.getItem('maxContextItems');
      if (savedMaxItems) {
        const parsed = parseInt(savedMaxItems, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
          return parsed;
        }
      }
    } catch (error) {
      console.error("Failed to load max context items from localStorage", error);
    }
    return 30; // Default value
  });

  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSummaryCopied, setIsSummaryCopied] = useState(false);

  useEffect(() => {
    try {
      const savableConversations = conversations.map(conv => {
        const { ...restOfConv } = conv;
        return {
          ...restOfConv,
          files: conv.files.filter(f => f.status === 'loaded'),
          messages: conv.messages.map(msg => {
            const { isLoading, ...restOfMsg } = msg; // Exclude transient isLoading state
            return {
              ...restOfMsg,
              attachments: (msg.attachments || []).filter(a => a.status === 'loaded'),
            };
          }),
        };
      });
      localStorage.setItem('conversations', JSON.stringify(savableConversations));
      if (activeConversationId) {
        localStorage.setItem('activeConversationId', activeConversationId);
      } else if (conversations.length > 0) {
        localStorage.setItem('activeConversationId', conversations[0].id);
      }
    } catch (error) {
      console.error("Failed to save conversations to localStorage", error);
    }
  }, [conversations, activeConversationId]);
  
  useEffect(() => {
    try {
      localStorage.setItem('maxContextItems', maxContextItems.toString());
    } catch (error) {
      console.error("Failed to save max context items to localStorage", error);
    }
  }, [maxContextItems]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [initialQuerySuggestions, setInitialQuerySuggestions] = useState<string[]>([]);
  
  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0];
  const chatMessages = activeConversation?.messages || [];
  const contextUrls = activeConversation?.urls || [];
  const contextFiles = activeConversation ? activeConversation.files.filter(f => f.status === 'loaded') as Required<Attachment>[] : [];

  const updateActiveConversation = (updater: (conversation: Conversation) => Conversation) => {
    setConversations(prev =>
      prev.map(c => (c.id === activeConversationId ? updater(c) : c))
    );
  };

  const fetchAndSetInitialSuggestions = useCallback(async (currentUrls: string[]) => {
    if (currentUrls.length === 0) {
      setInitialQuerySuggestions([]);
      return;
    }
    setIsFetchingSuggestions(true);
    setInitialQuerySuggestions([]); 

    try {
      const response = await getInitialSuggestions(currentUrls, lang); 
      let suggestionsArray: string[] = [];
      if (response.text) {
        try {
          const parsed = JSON.parse(response.text);
          if(parsed.suggestions && Array.isArray(parsed.suggestions)) {
            suggestionsArray = parsed.suggestions;
          }
        } catch { /* Ignore parsing errors */ }
        setInitialQuerySuggestions(suggestionsArray.slice(0, 4)); 
      }
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to fetch initial suggestions.';
      updateActiveConversation(c => ({
        ...c,
        messages: [...c.messages, { id: `sys-err-suggestion-fetch-${Date.now()}`, text: `Error fetching suggestions: ${errorMessage}`, sender: MessageSender.SYSTEM, timestamp: new Date() }]
      }));
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, [activeConversationId, lang]); 

  useEffect(() => {
    if (contextUrls.length > 0 && process.env.API_KEY) { 
        fetchAndSetInitialSuggestions(contextUrls);
    } else {
        setInitialQuerySuggestions([]); 
    }
  }, [contextUrls, fetchAndSetInitialSuggestions]); 


  const handleNewConversation = (name: string) => {
    if (!name.trim()) return;
    const newId = `conv-${Date.now()}`;
    const newConversation: Conversation = {
      id: newId,
      name: name.trim(),
      urls: [],
      files: [],
      lastUpdated: Date.now(),
      messages: [{
        id: `system-welcome-${newId}`,
        text: t('newChatCreated', { conversationName: name.trim() }),
        sender: MessageSender.SYSTEM,
        timestamp: new Date(),
      }]
    };
    setConversations(prev => [...prev, newConversation].sort((a,b) => b.lastUpdated - a.lastUpdated));
    setActiveConversationId(newConversation.id);
  };

  const handleDeleteConversation = () => {
    if (conversations.length <= 1) {
      console.warn("Cannot delete the last conversation.");
      return;
    }
    const activeIndex = conversations.findIndex(c => c.id === activeConversationId);
    const newConversations = conversations.filter(c => c.id !== activeConversationId);
    
    let nextActiveIndex = activeIndex > 0 ? activeIndex - 1 : 0;
    if (nextActiveIndex >= newConversations.length) {
      nextActiveIndex = newConversations.length - 1;
    }
    const nextActiveId = newConversations[nextActiveIndex]?.id || '';
    
    setConversations(newConversations);
    setActiveConversationId(nextActiveId);
  };
  
  const handleRenameConversation = (newName: string) => {
    if (!newName.trim()) return;
    updateActiveConversation(c => ({ ...c, name: newName.trim(), lastUpdated: Date.now() }));
  };

  const handleAddUrl = (url: string) => {
    updateActiveConversation(c => {
      if (c.urls.length + c.files.length < maxContextItems && !c.urls.includes(url)) {
        return { ...c, urls: [...c.urls, url], lastUpdated: Date.now() };
      }
      return c;
    });
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    updateActiveConversation(c => ({
      ...c,
      urls: c.urls.filter(url => url !== urlToRemove),
      lastUpdated: Date.now()
    }));
  };
  
  const handleAddFiles = (files: File[]) => {
    const placeholders: Attachment[] = files.map(file => ({
      id: `file-${file.name}-${Date.now()}`,
      name: file.name,
      type: file.type,
      status: 'loading',
    }));

    updateActiveConversation(c => ({ ...c, files: [...c.files, ...placeholders] }));

    files.forEach((file, index) => {
      const reader = new FileReader();
      const placeholder = placeholders[index];

      reader.onload = (e) => {
        const base64Data = (e.target?.result as string).split(',')[1];
        handleUpdateFile({ ...placeholder, status: 'loaded', data: base64Data });
      };
      reader.onerror = () => {
        handleUpdateFile({ ...placeholder, status: 'error', errorMessage: 'Failed to read file.' });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUpdateFile = (updatedFile: Attachment) => {
    updateActiveConversation(c => ({
      ...c,
      files: c.files.map(f => f.id === updatedFile.id ? updatedFile : f),
      lastUpdated: Date.now()
    }));
  };
  
  const handleRemoveFile = (fileIdToRemove: string) => {
    updateActiveConversation(c => ({
      ...c,
      files: c.files.filter(file => file.id !== fileIdToRemove),
      lastUpdated: Date.now()
    }));
  };

  const _triggerModelResponse = async (historyForApi: ChatMessage[]) => {
      if (isLoading || isFetchingSuggestions) return;

      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        const errorMsg: ChatMessage = {
          id: `error-apikey-${Date.now()}`,
          text: 'ERROR: API Key (process.env.API_KEY) is not configured. Please set it up to send messages.',
          sender: MessageSender.SYSTEM,
          timestamp: new Date(),
        };
        updateActiveConversation(c => ({...c, messages: [...c.messages, errorMsg]}));
        return;
      }

      setIsLoading(true);
      setInitialQuerySuggestions([]);

      const modelPlaceholderMessage: ChatMessage = {
        id: `model-response-${Date.now()}`,
        text: '', // Start with empty text for streaming
        sender: MessageSender.MODEL,
        timestamp: new Date(),
        isLoading: true,
      };

      updateActiveConversation(c => ({
        ...c,
        messages: [...c.messages, modelPlaceholderMessage],
        lastUpdated: Date.now()
      }));

      try {
        const stream = generateContentStreamWithUrlContext(historyForApi, contextUrls, contextFiles, lang);
        
        let fullText = '';
        let finalCitations: CitationSource[] | undefined = undefined;
        let finalUrlContext: UrlContextMetadataItem[] | undefined = undefined;

        for await (const chunk of stream) {
            if (chunk.textChunk) {
                fullText += chunk.textChunk;
                // Update the last message in the conversation with the appended text.
                updateActiveConversation(c => ({
                    ...c,
                    messages: c.messages.map(msg =>
                        msg.id === modelPlaceholderMessage.id ? { ...msg, text: fullText } : msg
                    )
                }));
            }
            if (chunk.citations) finalCitations = chunk.citations;
            if (chunk.urlContextMetadata) finalUrlContext = chunk.urlContextMetadata;
        }

        // Final update with all metadata and isLoading set to false
        updateActiveConversation(c => ({
            ...c,
            messages: c.messages.map(msg =>
                msg.id === modelPlaceholderMessage.id ? {
                    ...msg,
                    text: fullText, // Ensure final text is set
                    isLoading: false,
                    citations: finalCitations,
                    urlContext: finalUrlContext,
                } : msg
            )
        }));
        
        speakText(fullText);

      } catch (e: any) {
        const errorMessage = e.message || 'Failed to get response from AI.';
        updateActiveConversation(c => ({
          ...c,
          messages: c.messages.map(msg =>
            msg.id === modelPlaceholderMessage.id
              ? { ...modelPlaceholderMessage, text: `Error: ${errorMessage}`, sender: MessageSender.SYSTEM, isLoading: false }
              : msg
          )
        }));
      } finally {
        setIsLoading(false);
      }
  };

  const handleSendMessage = async (query: string, attachments: Attachment[] = []) => {
    if ((!query.trim() && attachments.length === 0) || isLoading || isFetchingSuggestions) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      text: query,
      sender: MessageSender.USER,
      timestamp: new Date(),
      attachments: attachments.filter(a => a.status === 'loaded'),
    };
    
    const newHistory = [...chatMessages, userMessage];
    updateActiveConversation(c => ({ ...c, messages: newHistory }));
    _triggerModelResponse(newHistory);
  };

  const handleEditMessage = (messageId: string, newText: string) => {
      const messageIndex = chatMessages.findIndex(m => m.id === messageId);
      if (messageIndex === -1 || chatMessages[messageIndex].sender !== MessageSender.USER) return;
  
      // Create a new history truncated up to the point of editing.
      const truncatedHistory = chatMessages.slice(0, messageIndex);
      
      // Create the updated message.
      const editedMessage: ChatMessage = { 
        ...chatMessages[messageIndex], 
        text: newText,
        timestamp: new Date(), // Optionally update timestamp
      };

      const newHistoryForApi = [...truncatedHistory, editedMessage];

      // Set the conversation state to the new history immediately.
      updateActiveConversation(c => ({
        ...c,
        messages: newHistoryForApi,
        lastUpdated: Date.now()
      }));

      _triggerModelResponse(newHistoryForApi);
  };
  
  const handleRegenerateResponse = (messageId: string) => {
      const messageIndex = chatMessages.findIndex(m => m.id === messageId);
      // We need to find the model response to replace, and resend the history up to that point.
      if (messageIndex === -1 || chatMessages[messageIndex].sender !== MessageSender.MODEL) return;
  
      const newHistoryForApi = chatMessages.slice(0, messageIndex);

      // Update conversation state to remove the old model response and any subsequent messages.
      updateActiveConversation(c => ({
        ...c,
        messages: newHistoryForApi,
        lastUpdated: Date.now()
      }));

      _triggerModelResponse(newHistoryForApi);
  };

  const handleSuggestedQueryClick = (query: string) => {
    handleSendMessage(query);
  };

  const handleExportConversation = (format: 'md' | 'txt') => {
    if (!activeConversation) return;

    const fileExtension = format;
    const mimeType = format === 'md' ? 'text/markdown' : 'text/plain';

    let content = `# Conversation: ${activeConversation.name}\n\n`;

    activeConversation.messages.forEach(msg => {
        if (msg.sender === MessageSender.SYSTEM && msg.id.startsWith('system-welcome')) return; // Skip initial welcome
        const sender = msg.sender.charAt(0).toUpperCase() + msg.sender.slice(1);
        const timestamp = msg.timestamp.toLocaleString();
        
        if (format === 'md') {
            content += `**${sender}** (_${timestamp}_):\n\n`;
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(att => {
                    content += `_[Attachment: ${att.name}]_\n\n`;
                });
            }
            content += `${msg.text || '(No text content)'}\n\n---\n\n`;
        } else { // txt format
            content += `${sender} (${timestamp}):\n`;
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(att => {
                    content += `[Attachment: ${att.name}]\n`;
                });
            }
            content += `${msg.text || '(No text content)'}\n\n`;
        }
    });

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeFilename = activeConversation.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${safeFilename}_${new Date().toISOString().split('T')[0]}.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSummarize = async () => {
    if (isSummarizing || !activeConversation || activeConversation.messages.length < 3) {
      if (activeConversation && activeConversation.messages.length < 3) {
        setSummaryContent(t('summaryTooShort'));
        setIsSummaryModalOpen(true);
      }
      return;
    }
    
    setIsSummarizing(true);
    setIsSummaryModalOpen(true);
    setSummaryContent('');

    try {
      const summary = await getSummary(activeConversation.messages, lang);
      setSummaryContent(summary);
    } catch (error: any) {
      setSummaryContent(`Error generating summary: ${error.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };
  
  const chatPlaceholder = (contextUrls.length > 0 || contextFiles.length > 0)
    ? t('chatPlaceholder', { conversationName: activeConversation?.name || '' })
    : t('defaultChatPlaceholder');

  return (
    <div 
      className="h-screen max-h-screen antialiased relative overflow-x-hidden bg-[#121212] text-[#E2E2E2]"
    >
      {isSummaryModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#1E1E1E] border border-white/10 rounded-xl shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-white/10 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-white">{t('conversationSummary')}</h3>
                    <button 
                        onClick={() => setIsSummaryModalOpen(false)}
                        className="p-1 text-gray-400 rounded-full hover:bg-white/10 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto prose prose-sm prose-invert w-full">
                    {isSummarizing ? (
                        <div className="flex justify-center items-center p-8">
                            <div className="w-8 h-8 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <p className="whitespace-pre-wrap">{summaryContent}</p>
                    )}
                </div>
                <div className="flex justify-end items-center p-4 border-t border-white/10 flex-shrink-0">
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(summaryContent);
                            setIsSummaryCopied(true);
                            setTimeout(() => setIsSummaryCopied(false), 2000);
                        }}
                        disabled={isSummarizing || !summaryContent}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm disabled:opacity-50"
                    >
                        {isSummaryCopied ? <Check size={16} className="text-green-400" /> : <Clipboard size={16} />}
                        {isSummaryCopied ? t('copied') : t('copy')}
                    </button>
                </div>
            </div>
        </div>
      )}

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      
      <div className="flex h-full w-full md:p-4 md:gap-4">
        <div className={`
          fixed top-0 start-0 h-full w-11/12 max-w-sm z-30 transform transition-transform ease-in-out duration-300 p-3
          md:static md:p-0 md:w-1/3 lg:w-1/4 md:h-full md:max-w-none md:translate-x-0 md:z-auto
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'}
        `}>
          <KnowledgeBaseManager
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSetConversationId={setActiveConversationId}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
            onRenameConversation={handleRenameConversation}
            onExportConversation={handleExportConversation}
            onAddUrl={handleAddUrl}
            onRemoveUrl={handleRemoveUrl}
            onAddFiles={handleAddFiles}
            onRemoveFile={handleRemoveFile}
            maxItems={maxContextItems}
            onSetMaxItems={setMaxContextItems}
            onCloseSidebar={() => setIsSidebarOpen(false)}
          />
        </div>

        <div className="w-full h-full p-3 md:p-0 md:w-2/3 lg:w-3/4">
          <ChatInterface
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onRegenerateResponse={handleRegenerateResponse}
            isLoading={isLoading}
            placeholderText={chatPlaceholder}
            initialQuerySuggestions={initialQuerySuggestions}
            onSuggestedQueryClick={handleSuggestedQueryClick}
            isFetchingSuggestions={isFetchingSuggestions}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onSummarize={handleSummarize}
            onExportConversation={handleExportConversation}
          />
        </div>
      </div>
    </div>
  );
};

export default App;