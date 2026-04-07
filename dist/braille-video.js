import { readdir, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
const brailleXDots = 2;
const brailleYDots = 4;
const brailleBlank = 10240;
export async function extractVideoFrames(options) {
    await mkdir(options.outputDir, { recursive: true });
    await run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        options.inputPath,
        '-vf',
        `fps=${options.fps}`,
        '-frames:v',
        options.maxFrames.toString(),
        join(options.outputDir, 'frame-%05d.png'),
    ]);
    const names = await readdir(options.outputDir);
    return names
        .filter(name => name.endsWith('.png'))
        .sort()
        .map(name => join(options.outputDir, name));
}
export async function frameToBraille(input, options) {
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) {
        throw new Error('Unable to read frame dimensions.');
    }
    const size = fitBrailleSize(metadata.width, metadata.height, options.width, options.maxChars);
    const raw = await sharp(input)
        .resize(size.pixelWidth, size.pixelHeight, { fit: 'fill' })
        .removeAlpha()
        .greyscale()
        .raw()
        .toBuffer();
    const pixels = ditherFloydSteinberg(raw, size.pixelWidth, size.pixelHeight, options.threshold);
    return pixelsToBraille(pixels, size.pixelWidth, size.pixelHeight, options.invert);
}
export async function cleanupDir(dir) {
    await rm(dir, { recursive: true, force: true });
}
function fitBrailleSize(sourceWidth, sourceHeight, requestedWidth, maxChars) {
    const aspect = sourceHeight / sourceWidth;
    let width = Math.max(1, Math.floor(requestedWidth));
    let height = brailleHeightForWidth(width, aspect);
    while (width > 1 && charCount(width, height) > maxChars) {
        width--;
        height = brailleHeightForWidth(width, aspect);
    }
    return {
        width,
        height,
        pixelWidth: width * brailleXDots,
        pixelHeight: height * brailleYDots,
    };
}
function brailleHeightForWidth(width, aspect) {
    return Math.max(1, Math.ceil(width * brailleXDots * aspect / brailleYDots));
}
function charCount(width, height) {
    return width * height + Math.max(0, height - 1);
}
function ditherFloydSteinberg(input, width, height, threshold) {
    const working = Float32Array.from(input);
    const output = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = y * width + x;
            const oldValue = working[offset];
            const newValue = oldValue > threshold ? 255 : 0;
            const error = oldValue - newValue;
            output[offset] = newValue;
            diffuse(working, width, height, x + 1, y, error * 7 / 16);
            diffuse(working, width, height, x - 1, y + 1, error * 3 / 16);
            diffuse(working, width, height, x, y + 1, error * 5 / 16);
            diffuse(working, width, height, x + 1, y + 1, error * 1 / 16);
        }
    }
    return output;
}
function diffuse(pixels, width, height, x, y, error) {
    if (x < 0 || x >= width || y < 0 || y >= height)
        return;
    const offset = y * width + x;
    pixels[offset] = Math.max(0, Math.min(255, pixels[offset] + error));
}
function pixelsToBraille(pixels, width, height, invert) {
    const lines = [];
    const targetValue = invert ? 255 : 0;
    for (let y = 0; y < height; y += brailleYDots) {
        const chars = [];
        for (let x = 0; x < width; x += brailleXDots) {
            chars.push(brailleBlank
                + (+(pixelAt(pixels, width, x + 1, y + 3) === targetValue) << 7)
                + (+(pixelAt(pixels, width, x, y + 3) === targetValue) << 6)
                + (+(pixelAt(pixels, width, x + 1, y + 2) === targetValue) << 5)
                + (+(pixelAt(pixels, width, x + 1, y + 1) === targetValue) << 4)
                + (+(pixelAt(pixels, width, x + 1, y) === targetValue) << 3)
                + (+(pixelAt(pixels, width, x, y + 2) === targetValue) << 2)
                + (+(pixelAt(pixels, width, x, y + 1) === targetValue) << 1)
                + (+(pixelAt(pixels, width, x, y) === targetValue) << 0));
        }
        lines.push(String.fromCharCode(...chars));
    }
    return lines.join('\n');
}
function pixelAt(pixels, width, x, y) {
    return pixels[y * width + x];
}
function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
        });
    });
}
//# sourceMappingURL=braille-video.js.map