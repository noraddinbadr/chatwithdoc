/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, X, Link, FileText, Upload, Pencil, Check, X as XIcon, AlertTriangle } from 'lucide-react';
import { Conversation, Attachment } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface KnowledgeBaseManagerProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSetConversationId: (id: string) => void;
  onNewConversation: (name: string) => void;
  onDeleteConversation: () => void;
  onRenameConversation: (newName: string) => void;
  onExportConversation: (format: 'md' | 'txt') => void;
  onAddUrl: (url: string) => void;
  onRemoveUrl: (url: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (fileId: string) => void;
  maxItems: number;
  onSetMaxItems: (limit: number) => void;
  onCloseSidebar?: () => void;
}

const KnowledgeBaseManager: React.FC<KnowledgeBaseManagerProps> = ({ 
  conversations,
  activeConversationId,
  onSetConversationId,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onExportConversation,
  onAddUrl, 
  onRemoveUrl, 
  onAddFiles,
  onRemoveFile,
  maxItems,
  onSetMaxItems,
  onCloseSidebar,
}) => {
  const { t, lang, setLang } = useLanguage();
  const [currentUrlInput, setCurrentUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [editMode, setEditMode] = useState<'none' | 'create' | 'rename'>('none');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const urls = activeConversation?.urls || [];
  const files = activeConversation?.files || [];
  const totalItems = urls.length + files.length;
  
  useEffect(() => {
    if (editMode !== 'none' && nameInputRef.current) {
        nameInputRef.current.focus();
        nameInputRef.current.select();
    }
  }, [editMode]);

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
  }, [exportMenuRef]);

  const isValidUrl = (urlString: string): boolean => {
    try {
      new URL(urlString);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleAddUrlClick = () => {
    setError(null);
    if (!currentUrlInput.trim()) {
      setError(t('errorUrlEmpty'));
      return;
    }
    if (!isValidUrl(currentUrlInput)) {
      setError(t('errorUrlInvalid'));
      return;
    }
    if (totalItems >= maxItems) {
      setError(t('errorMaxItemsReached', { maxItems }));
      return;
    }
    if (urls.includes(currentUrlInput)) {
      setError(t('errorUrlExists'));
      return;
    }
    onAddUrl(currentUrlInput);
    setCurrentUrlInput('');
  };
  
  const handleFilesSelected = (selectedFiles: FileList | null) => {
    setError(null);
    if (!selectedFiles) return;

    if (totalItems + selectedFiles.length > maxItems) {
        setError(t('errorCannotAddAllFiles', { maxItems }));
        return;
    }
    
    const supportedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 
      'text/plain', 'text/markdown', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    ];

    const filesToProcess: File[] = [];
    let hasUnsupported = false;
    Array.from(selectedFiles).forEach(file => {
      if (!supportedTypes.includes(file.type)) {
        hasUnsupported = true;
        setError(t('errorFileUnsupported', { fileName: file.name }));
      } else if (files.some(existingFile => existingFile.name === file.name)) {
         setError(t('errorFileExists', { fileName: file.name }));
      }
      else {
        filesToProcess.push(file);
      }
    });

    if (filesToProcess.length > 0) {
      onAddFiles(filesToProcess);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(event.target.files);
    if (event.target) event.target.value = '';
  };
  
  const handleStartCreate = () => {
    setEditMode('create');
    setGroupNameInput('New Conversation');
  };

  const handleStartRename = () => {
    if (activeConversation) {
      setEditMode('rename');
      setGroupNameInput(activeConversation.name);
    }
  };

  const handleCancelEdit = () => {
    setEditMode('none');
    setGroupNameInput('');
  };

  const handleSaveGroup = () => {
    if (!groupNameInput.trim()) return;

    if (editMode === 'create') {
      onNewConversation(groupNameInput.trim());
    } else if (editMode === 'rename') {
      onRenameConversation(groupNameInput.trim());
    }
    handleCancelEdit();
  };

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'ar' : 'en');
  };

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
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };


  return (
    <div 
      className="p-4 bg-[#1E1E1E] shadow-md rounded-xl h-full flex flex-col border border-[rgba(255,255,255,0.05)] relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && <div className="dropzone-overlay"><p className="text-xl font-bold text-white">{t('dropFilesHere')}</p></div>}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-[#E2E2E2]">{t('knowledgeBase')}</h2>
        <div className="flex items-center gap-2">
            <button
                onClick={toggleLanguage}
                className="px-2 py-1 bg-white/[.12] hover:bg-white/20 text-white rounded-md transition-colors text-xs font-bold"
                title={`Switch to ${lang === 'en' ? 'Arabic' : 'English'}`}
            >
                {lang === 'en' ? 'AR' : 'EN'}
            </button>
            {onCloseSidebar && (
            <button
                onClick={onCloseSidebar}
                className="p-1 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors md:hidden"
                aria-label="Close knowledge base"
            >
                <X size={24} />
            </button>
            )}
        </div>
      </div>
      
      <div className="mb-3">
        <label htmlFor="url-group-select-kb" className="block text-sm font-medium text-[#A8ABB4] mb-1">
          {t('activeConversation')}
        </label>
        <div className="relative w-full">
          <select
            id="url-group-select-kb"
            value={activeConversationId}
            onChange={(e) => onSetConversationId(e.target.value)}
            disabled={editMode !== 'none'}
            className="w-full py-2 ps-3 pe-8 appearance-none border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] rounded-md focus:ring-1 focus:ring-white/20 focus:border-white/20 text-sm disabled:bg-[#4A4A4A] disabled:text-[#777777]"
          >
            {conversations.map(conv => (
              <option key={conv.id} value={conv.id}>
                {conv.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A8ABB4] pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={handleStartCreate}
          disabled={editMode !== 'none'}
          className="px-2 py-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-md transition-colors text-xs flex items-center justify-center gap-1.5 disabled:bg-[#4A4A4A] disabled:text-[#777777] disabled:cursor-not-allowed"
        >
          <Plus size={12} /> {t('new')}
        </button>
        <button
          onClick={handleStartRename}
          disabled={editMode !== 'none'}
          className="px-2 py-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-md transition-colors text-xs flex items-center justify-center gap-1.5 disabled:bg-[#4A4A4A] disabled:text-[#777777] disabled:cursor-not-allowed"
        >
          <Pencil size={12} /> {t('rename')}
        </button>
        <button
          onClick={() => {
            if (window.confirm(t('confirmDeleteConversation', { conversationName: activeConversation?.name || '' }))) {
              onDeleteConversation();
            }
          }}
          disabled={conversations.length <= 1 || editMode !== 'none'}
          className="px-2 py-1.5 bg-red-800/40 hover:bg-red-800/60 text-red-300 rounded-md transition-colors text-xs flex items-center justify-center gap-1.5 disabled:bg-[#4A4A4A] disabled:text-[#777777] disabled:cursor-not-allowed"
        >
          <Trash2 size={12} /> {t('delete')}
        </button>
        <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setIsExportMenuOpen(prev => !prev)}
              disabled={editMode !== 'none'}
              className="w-full px-2 py-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-md transition-colors text-xs flex items-center justify-center gap-1.5 disabled:bg-[#4A4A4A] disabled:text-[#777777] disabled:cursor-not-allowed"
            >
              <Upload size={12} /> {t('export')}
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
      </div>

      {editMode !== 'none' && (
        <div className="mb-3 p-3 bg-[#2C2C2C] rounded-lg border border-white/10">
            <label htmlFor="group-name-input" className="block text-sm font-medium text-[#A8ABB4] mb-1.5">
                {editMode === 'create' ? t('newConversationName') : t('renameConversation')}
            </label>
            <input
                ref={nameInputRef}
                id="group-name-input"
                type="text"
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveGroup();
                    if (e.key === 'Escape') handleCancelEdit();
                }}
                className="w-full h-8 py-1 px-2.5 border border-[rgba(255,255,255,0.1)] bg-[#1E1E1E] text-[#E2E2E2] placeholder-[#777777] rounded-lg focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-shadow text-sm"
            />
            <div className="flex justify-end gap-2 mt-2">
                <button onClick={handleCancelEdit} className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors text-xs flex items-center justify-center gap-1.5">
                  <XIcon size={12} /> {t('cancel')}
                </button>
                <button onClick={handleSaveGroup} className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-xs flex items-center justify-center gap-1.5">
                  <Check size={12} /> {t('save')}
                </button>
            </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <input
          type="url"
          value={currentUrlInput}
          onChange={(e) => setCurrentUrlInput(e.target.value)}
          placeholder={t('addUrlPlaceholder')}
          className="flex-grow h-8 py-1 px-2.5 border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] placeholder-[#777777] rounded-lg focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-shadow text-sm"
          onKeyPress={(e) => e.key === 'Enter' && handleAddUrlClick()}
        />
        <button
          onClick={handleAddUrlClick}
          disabled={totalItems >= maxItems}
          className="h-8 w-8 p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors disabled:bg-[#4A4A4A] disabled:text-[#777777] flex items-center justify-center"
          aria-label={t('addUrl')}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="mb-3">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/jpeg,image/png,image/webp,text/plain,text/markdown,application/pdf,.pdf,.docx,.xlsx" />
          <button
              onClick={() => fileInputRef.current?.click()}
              disabled={totalItems >= maxItems}
              className="w-full mt-2 h-8 px-3 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors disabled:bg-[#4A4A4A] disabled:text-[#777777] flex items-center justify-center gap-2 text-sm"
              aria-label={t('addFiles')}
          >
              <Upload size={14} /> {t('addFiles')}
          </button>
      </div>

      {error && <p className="text-xs text-[#f87171] mb-2">{error}</p>}
      {totalItems >= maxItems && <p className="text-xs text-[#fbbf24] mb-2">{t('errorMaxItemsReached', { maxItems })}</p>}
      
      <div className="flex-grow overflow-y-auto space-y-2 chat-container border-t border-[rgba(255,255,255,0.05)] pt-3">
        {totalItems === 0 && (
          <p className="text-[#777777] text-center py-3 text-sm">{t('addUrlsOrFiles', { conversationName: activeConversation?.name || '' })}</p>
        )}
        
        {urls.length > 0 && <h4 className="text-xs font-semibold text-[#A8ABB4] px-1 mb-1.5">{t('urls')} ({urls.length})</h4>}
        {urls.map((url) => (
          <div key={url} className="flex items-center justify-between p-2 ps-2 pe-1 bg-[#2C2C2C] border border-[rgba(255,255,255,0.05)] rounded-lg hover:shadow-sm transition-shadow group">
             <div className="flex items-center gap-2 truncate">
              <Link size={14} className="text-[#A8ABB4] flex-shrink-0" />
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#79B8FF] hover:underline truncate" title={url}>
                {url}
              </a>
            </div>
            <button 
              onClick={() => onRemoveUrl(url)}
              className="p-1 text-[#A8ABB4] hover:text-[#f87171] rounded-md hover:bg-[rgba(255,0,0,0.1)] transition-colors flex-shrink-0 ms-2 opacity-50 group-hover:opacity-100"
              aria-label={t('remove', { fileName: url })}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {files.length > 0 && <h4 className="text-xs font-semibold text-[#A8ABB4] px-1 mt-3 mb-1.5">{t('files')} ({files.length})</h4>}
        {files.map((file) => (
          <div key={file.id} className="flex items-center justify-between p-2 ps-2 pe-1 bg-[#2C2C2C] border border-[rgba(255,255,255,0.05)] rounded-lg hover:shadow-sm transition-shadow group" title={file.errorMessage}>
            <div className="flex items-center gap-2 truncate">
                {file.status === 'loading' && <div className="spinner flex-shrink-0"></div>}
                {file.status === 'error' && <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />}
                {file.status === 'loaded' && <FileText size={14} className="text-[#A8ABB4] flex-shrink-0" />}
                <span className={`text-xs truncate ${file.status === 'error' ? 'text-red-400' : 'text-white'}`} title={file.name}>
                  {file.name}
                </span>
            </div>
            <button 
              onClick={() => onRemoveFile(file.id)}
              className="p-1 text-[#A8ABB4] hover:text-[#f87171] rounded-md hover:bg-[rgba(255,0,0,0.1)] transition-colors flex-shrink-0 ms-2 opacity-50 group-hover:opacity-100"
              aria-label={t('remove', { fileName: file.name })}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-3 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <label htmlFor="max-items-input" className="block text-sm font-medium text-[#A8ABB4] mb-1.5">
            {t('contextLimit')} <span className="font-bold text-white">{maxItems}</span> {t('items')}
        </label>
        <input
            id="max-items-input"
            type="range"
            min="1"
            max="100"
            value={maxItems}
            onChange={(e) => onSetMaxItems(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-[#4A4A4A] rounded-lg appearance-none cursor-pointer range-slider"
            aria-label="Set maximum context items"
        />
      </div>
    </div>
  );
};

export default KnowledgeBaseManager;