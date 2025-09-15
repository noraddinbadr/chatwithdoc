/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: string[]) => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const { t } = useLanguage();
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const feedbackOptions = [
    { key: 'harmful', label: t('feedbackHarmful') },
    { key: 'notTrue', label: t('feedbackNotTrue') },
    { key: 'notHelpful', label: t('feedbackNotHelpful') },
  ];

  useEffect(() => {
    // Reset state when modal is closed
    if (!isOpen) {
      setSelectedOptions([]);
    }
  }, [isOpen]);

  const handleCheckboxChange = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(item => item !== option) : [...prev, option]
    );
  };

  const handleSubmit = () => {
    if (selectedOptions.length > 0) {
      onSubmit(selectedOptions);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-[#1E1E1E] border border-white/10 rounded-xl shadow-lg w-full max-w-sm flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-white/10 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">{t('provideFeedback')}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 rounded-full hover:bg-white/10 hover:text-white"
            aria-label={t('cancel')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto w-full">
          <div className="p-4 border border-white/10 rounded-md mb-4">
            <p className="text-white font-medium">{t('feedbackQuestion')}</p>
          </div>
          <div className="space-y-3">
            {feedbackOptions.map(option => (
              <label key={option.key} className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={selectedOptions.includes(option.label)}
                  onChange={() => handleCheckboxChange(option.label)}
                  className="h-5 w-5 rounded bg-[#2C2C2C] border-white/20 text-blue-500 focus:ring-blue-500/50"
                  style={{ boxShadow: 'none' }}
                />
                <span className="text-white text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end items-center p-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={handleSubmit}
            disabled={selectedOptions.length === 0}
            className="w-full px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
