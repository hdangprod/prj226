"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
exports.editMessageText = editMessageText;
exports.answerCallbackQuery = answerCallbackQuery;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
/**
 * Sends a message to a specific Telegram chat.
 * @param chatId Chat ID or username
 * @param text Message text in Markdown
 * @param options Additional Telegram sendMessage options (e.g. reply_markup)
 */
async function sendMessage(chatId, text, options = {}) {
    const url = `${BASE_URL}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        ...options
    };
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Telegram sendMessage failed with status ${res.status}:`, errorText);
        }
        return await res.json();
    }
    catch (error) {
        console.error('Error in sendMessage:', error);
        throw error;
    }
}
/**
 * Edits the text of an existing Telegram message.
 * @param chatId Chat ID or username
 * @param messageId Message ID to edit
 * @param text New message text in Markdown
 * @param options Additional Telegram editMessageText options
 */
async function editMessageText(chatId, messageId, text, options = {}) {
    const url = `${BASE_URL}/editMessageText`;
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'Markdown',
        ...options
    };
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Telegram editMessageText failed with status ${res.status}:`, errorText);
        }
        return await res.json();
    }
    catch (error) {
        console.error('Error in editMessageText:', error);
        throw error;
    }
}
/**
 * Answers a callback query from an inline keyboard button click to dismiss the loading state on Telegram client.
 * @param callbackQueryId Callback query identifier
 * @param text Optional notification text to display
 */
async function answerCallbackQuery(callbackQueryId, text = '') {
    const url = `${BASE_URL}/answerCallbackQuery`;
    const payload = {
        callback_query_id: callbackQueryId,
        text: text
    };
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Telegram answerCallbackQuery failed with status ${res.status}:`, errorText);
        }
        return await res.json();
    }
    catch (error) {
        console.error('Error in answerCallbackQuery:', error);
        throw error;
    }
}
