import 'dotenv/config';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Telegraf } from 'telegraf';
import { cleanupDir, extractVideoFrames, frameToBraille } from './braille-video.js';
const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
const asciiWidth = numberFromEnv('ASCII_WIDTH', 64);
const frameFps = numberFromEnv('FRAME_FPS', 1);
const maxFrames = numberFromEnv('MAX_FRAMES', 60);
const editDelayMs = numberFromEnv('EDIT_DELAY_MS', 1100);
const threshold = numberFromEnv('THRESHOLD', 127);
const invert = booleanFromEnv('INVERT', false);
const maxTelegramTextLength = 4096;
const maxFrameChars = maxTelegramTextLength - '<pre></pre>'.length;
if (!token) {
    throw new Error('Set BOT_TOKEN in .env or environment before running the bot.');
}
const bot = new Telegraf(token);
bot.start(ctx => ctx.reply('Пришли видео, я превращу его в ASCII Брайля и проиграю анимацию через редактирование сообщения.'));
bot.help(ctx => ctx.reply('Отправь видео файлом или обычным видео. Настройки: ASCII_WIDTH, FRAME_FPS, MAX_FRAMES, EDIT_DELAY_MS, THRESHOLD, INVERT.'));
bot.on(['video', 'document'], async (ctx) => {
    const file = 'video' in ctx.message
        ? ctx.message.video
        : ctx.message.document;
    if (!file)
        return;
    if ('mime_type' in file && file.mime_type && !file.mime_type.startsWith('video/')) {
        await ctx.reply('Нужен именно видеофайл.');
        return;
    }
    const status = await ctx.reply('Скачиваю и режу видео на кадры...');
    const workDir = await mkdtemp(join(tmpdir(), 'tg-braille-video-'));
    const inputPath = join(workDir, 'input-video');
    const framesDir = join(workDir, 'frames');
    try {
        const fileLink = await ctx.telegram.getFileLink(file.file_id);
        const videoResponse = await fetch(fileLink);
        if (!videoResponse.ok) {
            throw new Error(`Telegram file download failed: ${videoResponse.status} ${videoResponse.statusText}`);
        }
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        await writeFile(inputPath, videoBuffer);
        const framePaths = await extractVideoFrames({
            inputPath,
            outputDir: framesDir,
            fps: frameFps,
            maxFrames,
        });
        if (framePaths.length === 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, 'Не получилось извлечь кадры из видео.');
            return;
        }
        await editMessageText(ctx.telegram, ctx.chat.id, status.message_id, `Готовлю ${framePaths.length} кадров ASCII...`);
        for (let index = 0; index < framePaths.length; index++) {
            const frame = await frameToBraille(await readFile(framePaths[index]), {
                width: asciiWidth,
                threshold,
                invert,
                maxChars: maxFrameChars,
            });
            await editMessageText(ctx.telegram, ctx.chat.id, status.message_id, `<pre>${escapeHtml(frame)}</pre>`, {
                parse_mode: 'HTML',
            });
            if (index < framePaths.length - 1) {
                await delay(editDelayMs);
            }
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, `Ошибка: ${message.slice(0, 3500)}`);
    }
    finally {
        await cleanupDir(workDir);
    }
});
bot.catch(error => {
    console.error(error);
});
await bot.launch();
console.log('Telegram Braille video bot is running.');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
function numberFromEnv(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function booleanFromEnv(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
async function editMessageText(telegram, chatId, messageId, text, options = {}) {
    try {
        await telegram.editMessageText(chatId, messageId, undefined, text, options);
    }
    catch (error) {
        if (isMessageNotModifiedError(error))
            return;
        throw error;
    }
}
function isMessageNotModifiedError(error) {
    return error instanceof Error && error.message.toLowerCase().includes('message is not modified');
}
//# sourceMappingURL=bot.js.map