import { getFilePath, downloadFile } from '../tools/telegramClient';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, MODELS } from '../config';

/**
 * Vietnamese filler words / disfluencies to strip from transcriptions.
 * Uses word-boundary matching to avoid stripping partial words.
 */
const FILLER_WORDS = [
  'ờ', 'à', 'ừ', 'uh', 'uhm', 'um', 'hmm', 'hm',
  'ơi', 'ừm', 'á', 'ạ', 'è', 'ề', 'ồ', 'ơ',
  'thì', 'là', 'kiểu', 'basically', 'like', 'you know',
];

/**
 * Builds a regex pattern that matches filler words at word boundaries.
 * Handles both single-char Vietnamese fillers and multi-word English fillers.
 */
function buildFillerRegex(): RegExp {
  const escaped = FILLER_WORDS.map(w =>
    w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  // Match filler words surrounded by whitespace or at start/end of string
  // Use case-insensitive matching
  const pattern = escaped.map(w => `(?:^|\\s)${w}(?=\\s|[,.]|$)`).join('|');
  return new RegExp(pattern, 'gi');
}

const fillerRegex = buildFillerRegex();

/**
 * Strips filler words and normalizes whitespace in transcribed text.
 */
export function stripFillerWords(text: string): string {
  let cleaned = text.replace(fillerRegex, ' ');
  // Collapse multiple spaces into one
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  // Remove leading/trailing commas or periods left after stripping
  cleaned = cleaned.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
  return cleaned;
}

/**
 * Voice Processor: Downloads a Telegram voice note (.ogg) and transcribes it
 * using the Gemini LITE model with inline audio data.
 *
 * Architecture:
 *   1. Resolves Telegram file_id → file_path via Bot API
 *   2. Downloads the .ogg binary via Telegram file download endpoint
 *   3. Sends audio bytes as inlineData to Gemini for transcription
 *   4. Strips Vietnamese/English filler words from the result
 *
 * @param fileId - The Telegram file_id from the voice message
 * @returns The cleaned, transcribed text ready for intent routing
 */
export async function transcribeVoiceNote(fileId: string): Promise<string> {
  // ─── Test Mode: Return mock transcription ───
  if (process.env.NODE_ENV === 'test') {
    console.log(`[VoiceProcessor Mock] Transcribing file_id: ${fileId}`);
    const mockRaw = 'ờ uhm tôi cần làm giao diện đăng nhập cho PRJ226 à trước thứ 6';
    const cleaned = stripFillerWords(mockRaw);
    console.log(`[VoiceProcessor Mock] Raw: "${mockRaw}"`);
    console.log(`[VoiceProcessor Mock] Cleaned: "${cleaned}"`);
    return cleaned;
  }

  // ─── Production Mode ───
  // Step 1: Resolve file path from Telegram servers
  const filePath = await getFilePath(fileId);
  console.log(`[VoiceProcessor] Resolved file path: ${filePath}`);

  // Step 2: Download the binary audio data
  const audioBuffer = await downloadFile(filePath);
  console.log(`[VoiceProcessor] Downloaded ${audioBuffer.byteLength} bytes`);

  // Step 3: Convert ArrayBuffer to base64 for Gemini inlineData
  const audioBytes = Buffer.from(audioBuffer).toString('base64');

  // Step 4: Send to Gemini LITE for transcription
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODELS.LITE });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'audio/ogg',
        data: audioBytes,
      },
    },
    {
      text: `Transcribe the following Vietnamese audio message accurately.
Output ONLY the transcribed text in Vietnamese, nothing else.
Do not add any commentary, labels, or formatting.
If you cannot understand a part, skip it rather than guessing.`,
    },
  ]);

  const rawTranscription = result.response.text().trim();
  console.log(`[VoiceProcessor] Raw transcription: "${rawTranscription}"`);

  // Step 5: Strip filler words and normalize
  const cleanedText = stripFillerWords(rawTranscription);
  console.log(`[VoiceProcessor] Cleaned transcription: "${cleanedText}"`);

  if (!cleanedText) {
    throw new Error('[VoiceProcessor] Transcription resulted in empty text after filler removal');
  }

  return cleanedText;
}
