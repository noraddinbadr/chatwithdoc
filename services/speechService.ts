/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * Checks if a string contains Arabic characters.
 * @param text The string to check.
 * @returns True if the string contains Arabic characters, false otherwise.
 */
const isArabic = (text: string): boolean => {
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text);
};

/**
 * Removes Arabic diacritics (Tashkeel/Tanween) from a string for more natural speech.
 * @param text The string to process.
 * @returns The string without diacritics.
 */
const removeDiacritics = (text: string): string => {
    // This regex covers the common Arabic diacritics.
    return text.replace(/[\u064B-\u0652]/g, '');
};


/**
 * Speaks the provided text using the browser's SpeechSynthesis API.
 * This function instructs the browser to use its best available voice for the detected language,
 * prioritizing cloud-based voices for higher quality and consistency.
 * @param text The text to be spoken.
 */
export const speakText = async (text: string): Promise<void> => {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    console.warn("Browser does not support speech synthesis.");
    return;
  }

  // Cancel any ongoing speech to prevent overlap.
  window.speechSynthesis.cancel();
  
  // Clean up markdown for better speech flow.
  let cleanText = text
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`/g, '')
    .replace(/(\*|_){1,2}/g, '')
    .replace(/#+\s/g, '');

  const utterance = new SpeechSynthesisUtterance();
  
  if (isArabic(cleanText)) {
    // Remove diacritics for a more natural, less formal pronunciation.
    cleanText = removeDiacritics(cleanText); 
    utterance.lang = 'ar-SA'; // Set language code for Arabic.
  } else {
    utterance.lang = 'en-US'; // Set language code for English.
  }
  
  utterance.text = cleanText;
  utterance.rate = 1;
  utterance.pitch = 1;
  
  // By only setting the 'lang', we let the browser choose its best available voice,
  // which is often a high-quality, cloud-based (network) voice. This is more reliable
  // than manually iterating through the voice list.
  window.speechSynthesis.speak(utterance);
};

/**
 * Stops any currently active speech synthesis.
 */
export const stopSpeaking = (): void => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};
