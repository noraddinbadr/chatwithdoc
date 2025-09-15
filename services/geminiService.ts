/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


// FIX: Import CitationSource from local types, as it is not an exported member of @google/genai.
import { GoogleGenAI, GenerateContentResponse, Tool, HarmCategory, HarmBlockThreshold, Content, Part } from "@google/genai";
import { UrlContextMetadataItem, Attachment, CitationSource, ChatMessage, MessageSender } from '../types';
import * as mammoth from 'mammoth';
import * as xlsx from 'xlsx';

// IMPORTANT: The API key MUST be set as an environment variable `process.env.API_KEY`
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI;

// Model supporting URL context, consistent with user examples and documentation.
const MODEL_NAME = "gemini-2.5-flash"; 

const getAiInstance = (): GoogleGenAI => {
  if (!API_KEY) {
    console.error("API_KEY is not set in environment variables. Please set process.env.API_KEY.");
    throw new Error("Gemini API Key not configured. Set process.env.API_KEY.");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  }
  return ai;
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

/**
 * Processes an attachment, extracting text from documents or returning inline data for media.
 * @param attachment The file attachment to process.
 * @param prefix A string to identify the source of the file (e.g., 'Knowledge Base').
 * @returns A Gemini API `Part` object or null if the file type is unsupported.
 */
const createPartFromAttachment = async (attachment: Required<Attachment>, prefix: string): Promise<Part | null> => {
  const { name, type, data } = attachment;

  if (!data) return null; // Don't process attachments that failed to load

  try {
    // For text-based formats, decode from base64 and return a text part.
    if (type.startsWith('text/')) {
      const textContent = atob(data);
      return { text: `\n\n--- ${prefix} Content from file: ${name} ---\n${textContent}\n--- End of file: ${name} ---\n` };
    }

    // For DOCX, extract raw text content using mammoth.js.
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer;
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { text: `\n\n--- ${prefix} Content from file: ${name} ---\n${result.value}\n--- End of file: ${name} ---\n` };
    }

    // For XLSX, read the workbook and convert each sheet to CSV format.
    if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const workbook = xlsx.read(data, { type: 'base64' });
      let fullText = '';
      workbook.SheetNames.forEach(sheetName => {
        fullText += `\n\n--- Sheet: ${sheetName} ---\n`;
        const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        fullText += csv;
      });
      return { text: `\n\n--- ${prefix} Content from file: ${name} ---\n${fullText}\n--- End of file: ${name} ---\n` };
    }

    // For types directly supported by the API (images, PDF), return an inlineData part.
    const supportedInlineTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (supportedInlineTypes.includes(type)) {
      return {
        inlineData: { mimeType: type, data: data },
      };
    }
    
    console.warn(`Unsupported MIME type encountered: ${type}. Skipping file ${name}.`);
    return null;

  } catch (e) {
    console.error(`Failed to process file ${name} (${type})`, e);
    // Return a text part indicating the error to the model.
    return { text: `\n\n--- Error processing file: ${name}. The file could not be read or is corrupted. ---\n` };
  }
};

export async function* generateContentStreamWithUrlContext(
  history: ChatMessage[],
  contextUrls: string[],
  contextFiles: Required<Attachment>[],
  language: 'ar' | 'en'
): AsyncGenerator<{
  textChunk?: string;
  urlContextMetadata?: UrlContextMetadataItem[];
  citations?: CitationSource[];
}> {
  const currentAi = getAiInstance();
  
  const systemInstruction = {
    parts: [{ text: `You are a helpful and precise assistant. Your primary function is to answer questions based *only* on the provided context from documentation URLs and knowledge base files.
- Your knowledge is strictly limited to the provided materials. Do not use any external knowledge.
- If the answer is not found in the context, you MUST state that the information is not available in the knowledge base.
- For every statement or fact you provide, you MUST cite the source from the context. Place a citation marker immediately after the statement it supports.
- Respond in ${language === 'ar' ? 'Arabic' : 'English'}, matching the user's prompt language.` }]
  };
  
  const contents: Content[] = [];

  // Process knowledge base files to prepend them to the first user turn.
  const contextFilePromises = contextFiles.map(file => createPartFromAttachment(file, 'Knowledge Base'));
  const resolvedContextParts = await Promise.all(contextFilePromises);
  const contextTextContent = resolvedContextParts
    .filter((p): p is { text: string } => p !== null && 'text' in p)
    .map(p => p.text)
    .join('');

  // Map chat history to Gemini's Content format
  let isFirstUserMessage = true;
  for (const message of history) {
    if (message.sender === MessageSender.SYSTEM || message.isLoading) continue;

    const role = message.sender === MessageSender.USER ? 'user' : 'model';
    const parts: Part[] = [];

    // Process attachments for the current message
    const attachmentPromises = (message.attachments || [])
        .filter(a => a.status === 'loaded')
        .map(att => createPartFromAttachment(att as Required<Attachment>, 'User Upload'));
    const resolvedAttachmentParts = await Promise.all(attachmentPromises);

    const attachmentTextContent = resolvedAttachmentParts
        .filter((p): p is { text: string } => p !== null && 'text' in p)
        .map(p => p.text)
        .join('');
    
    const dataParts = resolvedAttachmentParts.filter((p): p is Part => p !== null && !('text' in p));

    let combinedText = message.text || '';

    // If this is the first user message turn we are adding, prepend the KB content.
    if (role === 'user' && isFirstUserMessage && contextTextContent) {
      combinedText = contextTextContent + '\n' + combinedText;
      isFirstUserMessage = false;
    }
    if (attachmentTextContent) {
      combinedText += '\n' + attachmentTextContent;
    }
    
    if (combinedText.trim()) {
      parts.push({ text: combinedText });
    }
    parts.push(...dataParts);
    
    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const tools: Tool[] = contextUrls.length > 0 ? [{ urlContext: { urls: contextUrls } }] : [];

  try {
    const stream = await currentAi.models.generateContentStream({
      model: MODEL_NAME,
      contents: contents,
      config: { 
        systemInstruction: systemInstruction,
        tools: tools,
        safetySettings: safetySettings,
      },
    });

    let finalResponse: GenerateContentResponse | null = null;
    for await (const chunk of stream) {
        if (chunk.text) {
          yield { textChunk: chunk.text };
        }
        finalResponse = chunk;
    }
    
    if (finalResponse) {
        const candidate = finalResponse.candidates?.[0];
        const citations = (candidate?.citationMetadata as any)?.citationSources as CitationSource[] | undefined;
        let extractedUrlContextMetadata: UrlContextMetadataItem[] | undefined = undefined;

        if (candidate && candidate.urlContextMetadata && candidate.urlContextMetadata.urlMetadata) {
          extractedUrlContextMetadata = candidate.urlContextMetadata.urlMetadata as UrlContextMetadataItem[];
        }
        
        yield { urlContextMetadata: extractedUrlContextMetadata, citations };
    }

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
      const googleError = error as any; 
      if (googleError.message && googleError.message.includes("API key not valid")) {
         throw new Error("Invalid API Key. Please check your GEMINI_API_KEY environment variable.");
      }
      if (googleError.message && googleError.message.includes("quota")) {
        throw new Error("API quota exceeded. Please check your Gemini API quota.");
      }
      if (googleError.type === 'GoogleGenAIError' && googleError.message) {
        throw new Error(`Gemini API Error: ${googleError.message}`);
      }
      throw new Error(`Failed to get response from AI: ${error.message}`);
    }
    throw new Error("Failed to get response from AI due to an unknown error.");
  }
};

export const getInitialSuggestions = async (urls: string[], language: 'ar' | 'en'): Promise<{text:string}> => {
  if (urls.length === 0) {
    return { text: JSON.stringify({ suggestions: ["Add some URLs to get topic suggestions."] }) };
  }
  const currentAi = getAiInstance();
  const urlList = urls.join('\n');
  
  const promptText = `Based on the content of the following documentation URLs, provide 3-4 concise and actionable questions a developer might ask to explore these documents. These questions should be suitable as quick-start prompts. Return ONLY a JSON object with a key "suggestions" containing an array of these question strings. Respond in ${language === 'ar' ? 'Arabic' : 'English'}. For example: {"suggestions": ["What are the rate limits?", "How do I get an API key?", "Explain model X."]}

Relevant URLs:
${urlList}`;

  const contents: Content[] = [{ role: "user", parts: [{ text: promptText }] }];

  try {
    const response: GenerateContentResponse = await currentAi.models.generateContent({
      model: MODEL_NAME,
      contents: contents,
      config: {
        safetySettings: safetySettings,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    
    return { text };

  } catch (error) {
    console.error("Error calling Gemini API for initial suggestions:", error);
     if (error instanceof Error) {
      const googleError = error as any; 
      if (googleError.message && googleError.message.includes("API key not valid")) {
         throw new Error("Invalid API Key for suggestions. Please check your GEMINI_API_KEY environment variable.");
      }
      if (googleError.message && googleError.message.includes("Tool use with a response mime type: 'application/json' is unsupported")) {
        throw new Error("Configuration error: Cannot use tools with JSON response type for suggestions. This should be fixed in the code.");
      }
      throw new Error(`Failed to get initial suggestions from AI: ${error.message}`);
    }
    throw new Error("Failed to get initial suggestions from AI due to an unknown error.");
  }
};

export const getSummary = async (history: ChatMessage[], language: 'ar' | 'en'): Promise<string> => {
  const currentAi = getAiInstance();
  
  const conversationText = history
    .filter(msg => msg.sender === MessageSender.USER || msg.sender === MessageSender.MODEL)
    .map(msg => `${msg.sender === MessageSender.USER ? 'User' : 'AI'}: ${msg.text}`)
    .join('\n\n');

  if (!conversationText) {
    return "The conversation is empty. There's nothing to summarize.";
  }

  const promptText = `Please provide a concise summary of the key points, questions, and conclusions from the following conversation. The summary should be in ${language === 'ar' ? 'Arabic' : 'English'}.

Conversation History:
---
${conversationText}
---

Summary:`;

  const contents: Content[] = [{ role: "user", parts: [{ text: promptText }] }];

  try {
    const response: GenerateContentResponse = await currentAi.models.generateContent({
      model: MODEL_NAME,
      contents: contents,
      config: {
        safetySettings: safetySettings,
      },
    });

    return response.text;

  } catch (error) {
    console.error("Error calling Gemini API for summary:", error);
    if (error instanceof Error) {
      const googleError = error as any; 
      if (googleError.message && googleError.message.includes("API key not valid")) {
         throw new Error("Invalid API Key for summary. Please check your GEMINI_API_KEY environment variable.");
      }
      throw new Error(`Failed to get summary from AI: ${error.message}`);
    }
    throw new Error("Failed to get summary from AI due to an unknown error.");
  }
};