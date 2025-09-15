/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// FIX: Corrected typo in React import statement.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, MessageSender, Attachment } from '../types'; 
import { stopSpeaking } from '../services/speechService';
import MessageItem from './MessageItem';
import { ArrowUp, Menu, Mic, Camera, Plus, X, FileText, AlertTriangle, RefreshCw, ScrollText, Share2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (query: string, attachments: Attachment[]) => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onRegenerateResponse: (messageId: string) => void;
  isLoading: boolean;
  placeholderText?: string;
  initialQuerySuggestions?: string[];
  onSuggestedQueryClick?: (query: string) => void;
  isFetchingSuggestions?: boolean;
  onToggleSidebar?: () => void;
  onSummarize?: () => void;
  onExportConversation?: (format: 'md' | 'txt') => void;
}

type CameraStatus = 'initializing' | 'streaming' | 'denied' | 'not_found' | 'error';

const EmbeddedCameraView: React.FC<{
  onCapture: (attachment: Attachment) => void;
  onClose: () => void;
}> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('initializing');
  const [errorDetails, setErrorDetails] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);

  const startStream = useCallback(async () => {
    setStatus('initializing');
    setErrorDetails('');

    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }

    try {
      const constraints = { video: { facingMode } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (devices.filter(d => d.kind === 'videoinput').length > 1) {
        setCanSwitchCamera(true);
      } else {
        setCanSwitchCamera(false);
      }

      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          setStatus('streaming');
        };
        videoRef.current.srcObject = stream;
      } else {
         console.error("Camera component error: video element reference is missing.");
         stream.getTracks().forEach(track => track.stop());
         setStatus('error');
         setErrorDetails('Component failed to initialize.');
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('denied');
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        setStatus('not_found');
        setErrorDetails(`Could not find a camera. The requested camera (${facingMode}) may not be available or is in use.`);
      } else {
        setStatus('error');
        setErrorDetails(err.message || 'An unknown hardware error occurred.');
      }
    }
  }, [facingMode]);

  useEffect(() => {
    startStream();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [startStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState >= 2) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        if (facingMode === 'user') {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const base64Data = dataUrl.split(',')[1];
        
        onCapture({
          id: `capture-${Date.now()}`,
          name: `capture.jpg`,
          type: 'image/jpeg',
          data: base64Data,
          status: 'loaded',
        });
      }
    }
  };

  const handleSwitchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const renderStatusView = () => {
     switch(status) {
      case 'initializing':
        return (
            <div className="flex flex-col items-center justify-center p-4 h-full">
                <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                <p className="mt-2 text-gray-300 text-sm">Starting camera...</p>
            </div>
        );
      case 'denied':
        return (
            <div className="text-center p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-md w-full">
                <AlertTriangle className="mx-auto h-8 w-8 text-yellow-400" aria-hidden="true" />
                <h3 className="mt-2 text-lg font-semibold text-white">Camera Permission Needed</h3>
                <div className="mt-3 text-sm text-gray-200 space-y-2">
                  <p>To use the camera, you need to grant permission <strong className="text-yellow-300">for this site</strong> in your browser settings.</p>
                  <p className="font-medium">Here’s how:</p>
                  <ol className="text-start text-xs list-decimal list-inside mx-auto max-w-xs bg-black/20 p-3 rounded-md space-y-1">
                      <li>Tap the <strong>🔒 Lock icon</strong> in the address bar.</li>
                      <li>Tap on <strong>Permissions</strong> or <strong>Site settings</strong>.</li>
                      <li>Find <strong>Camera</strong> in the list and set it to <strong>Allow</strong>.</li>
                      <li>Return here and tap the <strong>Retry</strong> button.</li>
                  </ol>
                  <p className="pt-2 text-xs text-gray-400 border-t border-white/10 mt-3">
                    Note: This is a one-time setting for this application only and does not affect other websites.
                  </p>
                </div>
                <div className="mt-4 flex justify-center gap-3">
                    <button 
                      onClick={startStream} 
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-semibold shadow-md"
                    >
                      Retry
                    </button>
                    <button 
                      onClick={onClose} 
                      className="px-4 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm"
                    >
                      Close
                    </button>
                </div>
            </div>
        );
      case 'not_found':
         return (
            <div className="text-center p-4">
                <Camera size={32} className="mx-auto text-gray-500" />
                <h3 className="mt-2 text-md font-medium text-white">Camera Not Available</h3>
                <p className="mt-1 text-xs text-gray-400">{errorDetails || 'Please connect a camera and try again.'}</p>
                <div className="mt-3 flex justify-center gap-2">
                    <button onClick={startStream} className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm">Retry</button>
                     <button onClick={onClose} className="px-3 py-1 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm">Close</button>
                </div>
            </div>
         );
      case 'error':
        return (
            <div className="text-center p-4">
                <AlertTriangle className="mx-auto h-8 w-8 text-red-400" aria-hidden="true" />
                <h3 className="mt-2 text-md font-medium text-white">Camera Error</h3>
                <p className="mt-1 text-xs text-gray-400">{errorDetails || 'Your camera might be in use by another app.'}</p>
                <div className="mt-3 flex justify-center gap-2">
                    <button onClick={startStream} className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm">Retry</button>
                    <button onClick={onClose} className="px-3 py-1 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm">Close</button>
                </div>
            </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative mb-3 p-2 bg-[#2C2C2C] rounded-md border border-white/5">
        {status !== 'streaming' && (
           <div className="flex items-center justify-center bg-black/50 rounded-md aspect-video">
             {renderStatusView()}
           </div>
        )}
         {status === 'streaming' && canSwitchCamera && (
            <button
                onClick={handleSwitchCamera}
                className="absolute top-4 end-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                aria-label="Switch camera"
                title="Switch camera"
            >
                <RefreshCw size={18} />
            </button>
        )}
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className={`w-full h-auto rounded-md bg-black aspect-video ${status === 'streaming' ? 'block' : 'hidden'}`}
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)' }}
        />
        {status === 'streaming' && (
            <div className="flex justify-center gap-4 mt-2">
              <button onClick={handleCapture} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm">Capture Photo</button>
              <button onClick={onClose} className="px-4 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm">Close</button>
            </div>
        )}
        <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
};


const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  onEditMessage,
  onRegenerateResponse,
  isLoading, 
  placeholderText,
  initialQuerySuggestions,
  onSuggestedQueryClick,
  isFetchingSuggestions,
  onToggleSidebar,
  onSummarize,
  onExportConversation,
}) => {
  const { t, lang } = useLanguage();
  const [userQuery, setUserQuery] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isCameraViewVisible, setIsCameraViewVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const userQueryRef = useRef(userQuery);
  useEffect(() => { userQueryRef.current = userQuery; }, [userQuery]);

  const attachmentsRef = useRef(attachments);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  
  // Voice input state and refs
  const [isListening, setIsListening] = useState(false);
  const [isMicStarting, setIsMicStarting] = useState(false);
  const [hasRecognitionSupport, setHasRecognitionSupport] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const handleSendMessageCallback = useCallback((query: string, attachments: Attachment[]) => {
    onSendMessage(query, attachments);
  }, [onSendMessage]);

  // Handle clicks outside export menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
            setIsExportMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setHasRecognitionSupport(true);
      recognitionRef.current = new SpeechRecognition();
      const recognition = recognitionRef.current;
      recognition.continuous = false; 
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setUserQuery(transcript);
      };
      
      recognition.onstart = () => {
        setIsListening(true);
        setIsMicStarting(false);
      };

      recognition.onend = () => {
        const finalQuery = userQueryRef.current.trim();
        const finalAttachments = attachmentsRef.current.filter(a => a.status === 'loaded');
        if (finalQuery || finalAttachments.length > 0) {
          handleSendMessageCallback(finalQuery, finalAttachments);
        }
        setUserQuery('');
        setAttachments([]);
        setIsListening(false);
        setIsMicStarting(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error, event.message);
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          let errorMessage = `An unknown speech recognition error occurred: ${event.error}.`;
          if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            errorMessage = t('micError');
          } else if (event.error === 'audio-capture') {
            errorMessage = 'No microphone found or it is already in use. Please check your microphone connection and permissions.';
          } else if (event.error === 'network') {
            errorMessage = 'A network error occurred during speech recognition. Please check your connection.';
          }
          setMicError(errorMessage);
        }
        setIsListening(false);
        setIsMicStarting(false);
      };

    } else {
      console.warn('Speech recognition not supported in this browser.');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [handleSendMessageCallback, t]);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);
  
  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; // Reset height to shrink if needed
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [userQuery]);

  const handleSend = () => {
    const loadedAttachments = attachments.filter(a => a.status === 'loaded');
    if ((userQuery.trim() || loadedAttachments.length > 0) && !isLoading) {
      stopSpeaking();
      onSendMessage(userQuery.trim(), loadedAttachments);
      setUserQuery('');
      setAttachments([]);
    }
  };
  
  const handleMicClick = () => {
    if (isMicStarting) return;
    stopSpeaking(); 
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    } else if (hasRecognitionSupport) {
      setMicError(null);
      setIsMicStarting(true);
      setUserQuery('');
      try {
        if(recognitionRef.current) {
          recognitionRef.current.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
        }
        recognitionRef.current.start();
      } catch (err: any) {
        console.error('Error starting recognition:', err);
        setMicError('Failed to start microphone. Please try again.');
        setIsMicStarting(false);
      }
    }
  };

  const handleFiles = (files: FileList) => {
    const supportedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 
      'text/plain', 'text/markdown', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    ];
    
    const newPlaceholders: Attachment[] = Array.from(files).map(file => ({
      id: `att-${file.name}-${Date.now()}`,
      name: file.name,
      type: file.type,
      status: 'loading'
    }));
    
    setAttachments(prev => [...prev, ...newPlaceholders]);

    Array.from(files).forEach((file, index) => {
      const placeholder = newPlaceholders[index];
      
      if (!supportedTypes.includes(file.type)) {
        setAttachments(prev => prev.map(att => att.id === placeholder.id ? { ...att, status: 'error', errorMessage: 'Unsupported file type' } : att));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string)?.split(',')[1];
        if (base64Data) {
          setAttachments(prev => prev.map(att => att.id === placeholder.id ? { ...att, status: 'loaded', data: base64Data } : att));
        } else {
          setAttachments(prev => prev.map(att => att.id === placeholder.id ? { ...att, status: 'error', errorMessage: 'Failed to read file' } : att));
        }
      };
      reader.onerror = () => {
         setAttachments(prev => prev.map(att => att.id === placeholder.id ? { ...att, status: 'error', errorMessage: 'Failed to read file' } : att));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleFiles(event.target.files);
    }
    if(event.target) event.target.value = ''; // Allow selecting same file again
  };

  const removeAttachment = (idToRemove: string) => {
    setAttachments(prev => prev.filter(att => att.id !== idToRemove));
  };
  
  const handleCapture = (attachment: Attachment) => {
    setAttachments(prev => [...prev, attachment]);
    setIsCameraViewVisible(false); // Close camera after capture
  };

  const showSuggestions = initialQuerySuggestions && initialQuerySuggestions.length > 0 && messages.filter(m => m.sender !== MessageSender.SYSTEM).length <= 1;
  const areAttachmentsLoading = attachments.some(a => a.status === 'loading');
  const canSendMessage = (userQuery.trim().length > 0 || attachments.filter(a => a.status === 'loaded').length > 0);

  // --- Drag and Drop Handlers ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Necessary to allow drop
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleCameraButtonClick = () => {
    setIsCameraViewVisible(prev => !prev);
    if (!isCameraViewVisible) {
      stopSpeaking();
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-[#1E1E1E] rounded-xl shadow-md border border-[rgba(255,255,255,0.05)] relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && <div className="dropzone-overlay"><p className="text-xl font-bold text-white">{t('dropFilesHere')}</p></div>}
      
      <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
           {onToggleSidebar && (
            <button 
              onClick={onToggleSidebar}
              className="p-1.5 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors md:hidden"
              aria-label="Open knowledge base"
            >
              <Menu size={20} />
            </button>
          )}
          <div>
            <h2 className="text-xl font-semibold text-[#E2E22E]">{t('chatWithDocs')}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
            {onSummarize && (
              <button
                  onClick={onSummarize}
                  className="p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-md transition-colors disabled:bg-[#4A4A4A] disabled:text-[#777777]"
                  aria-label={t('summarizeConversation')}
                  title={t('summarizeConversation')}
                  disabled={isLoading || isFetchingSuggestions}
              >
                  <ScrollText size={18} />
              </button>
            )}
            {onExportConversation && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setIsExportMenuOpen(prev => !prev)}
                  disabled={isLoading || isFetchingSuggestions}
                  className="p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-md transition-colors disabled:bg-[#4A4A4A] disabled:text-[#777777]"
                  aria-label={t('shareExport')}
                  title={t('shareExport')}
                >
                  <Share2 size={18} />
                </button>
                {isExportMenuOpen && (
                    <div className="absolute end-0 mt-2 w-48 bg-[#2C2C2C] border border-white/10 rounded-md shadow-lg z-10 py-1">
                        <button
                            onClick={() => { onExportConversation('md'); setIsExportMenuOpen(false); }}
                            className="block w-full text-start px-3 py-1.5 text-xs text-white hover:bg-white/10"
                        >
                            {t('exportAsMarkdown')}
                        </button>
                        <button
                            onClick={() => { onExportConversation('txt'); setIsExportMenuOpen(false); }}
                            className="block w-full text-start px-3 py-1.5 text-xs text-white hover:bg-white/10"
                        >
                            {t('exportAsText')}
                        </button>
                    </div>
                )}
              </div>
            )}
        </div>
      </div>

      <div className="flex-grow p-4 overflow-y-auto chat-container bg-[#282828]">
        <div className="max-w-4xl mx-auto w-full">
          {messages.map((msg) => (
            <MessageItem 
              key={msg.id} 
              message={msg}
              onEditMessage={onEditMessage}
              onRegenerateResponse={onRegenerateResponse}
            />
          ))}
          
          {isFetchingSuggestions && (
              <div className="flex justify-center items-center p-3">
                  <div className="flex items-center space-x-1.5 text-[#A8ABB4]">
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                      <span className="text-sm">{t('fetchingSuggestions')}</span>
                  </div>
              </div>
          )}

          {showSuggestions && onSuggestedQueryClick && (
            <div className="my-3 px-1">
              <p className="text-xs text-[#A8ABB4] mb-1.5 font-medium">{t('orTryOneOfThese')}</p>
              <div className="flex flex-wrap gap-1.5">
                {initialQuerySuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => onSuggestedQueryClick(suggestion)}
                    className="bg-[#79B8FF]/10 text-[#79B8FF] px-2.5 py-1 rounded-full text-xs hover:bg-[#79B8FF]/20 transition-colors shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 border-t border-[rgba(255,255,255,0.05)] bg-[#1E1E1E] rounded-b-xl flex-shrink-0">
        {micError && (
          <div className="mb-2 text-center text-sm text-red-500">
            <p>{micError}</p>
          </div>
        )}
        {isListening && (
          <div className="flex justify-center items-center gap-4 text-sm text-[#A8ABB4] mb-3 px-4">
            <div className="w-full h-px bg-white/10"></div>
            <span className="whitespace-nowrap font-medium">{t('listening')}</span>
            <button onClick={handleMicClick} className="p-0.5 text-[#A8ABB4] hover:text-white" aria-label={t('stopStream')}><X size={18} /></button>
            <div className="w-full h-px bg-white/10"></div>
          </div>
        )}
        
        {isCameraViewVisible && (
          <EmbeddedCameraView 
            onCapture={handleCapture}
            onClose={() => setIsCameraViewVisible(false)}
          />
        )}

        {attachments.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-2 p-2 bg-[#2C2C2C] rounded-md border border-white/5">
              {attachments.map((file) => (
                <div key={file.id} className="relative flex items-center gap-2 bg-white/10 p-1 rounded-md text-xs text-white max-w-xs" title={file.errorMessage}>
                   <div className="h-8 w-8 flex items-center justify-center bg-white/20 rounded-sm flex-shrink-0">
                    {file.status === 'loading' && <div className="spinner"></div>}
                    {file.status === 'error' && <AlertTriangle size={16} className="text-red-400" />}
                    {file.status === 'loaded' && (file.type.startsWith('image/') ? 
                      <img src={`data:${file.type};base64,${file.data}`} alt={file.name} className="h-full w-full rounded-sm object-cover" />
                      : <FileText size={16} />
                    )}
                  </div>
                  <span className={`truncate ${file.status === 'error' ? 'text-red-400' : ''}`} title={file.name}>{file.name}</span>
                  <button onClick={() => removeAttachment(file.id)} className="absolute -top-1.5 -end-1.5 h-4 w-4 bg-red-600 rounded-full text-white flex items-center justify-center hover:bg-red-700 transition-colors" aria-label={t('remove', { fileName: file.name })}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className={`flex items-end gap-2 border rounded-xl p-2 bg-[#2C2C2C] transition-colors ${isListening ? 'border-dashed border-blue-500' : 'border-transparent'} focus-within:border-white/20`}>
          <div className="flex items-center flex-shrink-0 gap-1.5">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/jpeg,image/png,image/webp,text/plain,text/markdown,application/pdf,.pdf,.docx,.xlsx" />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={isLoading || isFetchingSuggestions || isListening || isMicStarting || isCameraViewVisible}
              className="h-9 w-9 p-2 bg-white/[.12] hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center flex-shrink-0 disabled:opacity-50" 
              aria-label={t('addFile')}
            >
              <Plus size={20} />
            </button>
            <button 
              onClick={handleCameraButtonClick} 
              disabled={isLoading || isFetchingSuggestions || isListening || isMicStarting}
              className={`h-9 w-9 p-2 ${isCameraViewVisible ? 'bg-blue-600' : 'bg-white/[.12]'} hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center flex-shrink-0 disabled:opacity-50`} 
              aria-label={t('useCamera')}
            >
                <Camera size={20} />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={userQuery}
            onChange={(e) => {
              if (!userQuery && e.target.value) { 
                stopSpeaking();
              }
              setUserQuery(e.target.value)
            }}
            placeholder={attachments.length > 0 ? t('addMessageToFiles') : (placeholderText || t('startTyping'))}
            className="flex-grow bg-transparent text-[#E2E2E2] placeholder-[#777777] focus:ring-0 border-none resize-none text-base px-1 py-1.5 max-h-48 leading-6 chat-textarea"
            style={{boxShadow: 'none'}}
            rows={1}
            disabled={isLoading || isFetchingSuggestions || areAttachmentsLoading || isCameraViewVisible}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="flex items-center flex-shrink-0">
            { !canSendMessage ? (
              <>
                {hasRecognitionSupport && (
                  <button
                      onClick={handleMicClick}
                      disabled={isLoading || isFetchingSuggestions || isMicStarting || isCameraViewVisible}
                      className={`h-9 w-9 p-2 ${isListening ? 'bg-blue-600 animate-pulse' : 'bg-white/[.12]'} hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center flex-shrink-0 disabled:opacity-50`}
                      aria-label={isListening ? t('stopListening') : t('startListening')}
                  >
                    {isMicStarting ? (
                      <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <Mic size={20} />
                    )}
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={handleSend}
                disabled={isLoading || isFetchingSuggestions || areAttachmentsLoading}
                className="h-9 w-9 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors disabled:bg-blue-600/50 flex items-center justify-center flex-shrink-0"
                aria-label={t('sendMessage')}
              >
                {(isLoading && messages[messages.length-1]?.isLoading && messages[messages.length-1]?.sender === MessageSender.MODEL) ? 
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 
                  : <ArrowUp size={20} />
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;