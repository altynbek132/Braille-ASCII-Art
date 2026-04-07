# Telegram Braille ASCII Video Bot

Бот принимает видео в Telegram, режет его на кадры через `ffmpeg`, конвертирует кадры в ASCII Брайля и проигрывает анимацию через `editMessageText`.

## Setup

```sh
npm install
cp .env.example .env
```

Заполни `BOT_TOKEN` в `.env`.

Нужен установленный `ffmpeg`:

```sh
ffmpeg -version
```

## Run

```sh
npm run bot
```

## Settings

Настройки задаются через `.env`:

```sh
ASCII_WIDTH=64
FRAME_FPS=1
MAX_FRAMES=60
EDIT_DELAY_MS=1100
THRESHOLD=127
INVERT=false
```

`ASCII_WIDTH` автоматически уменьшается, если кадр не помещается в лимит Telegram на 4096 символов.

## Checks

```sh
npm run check
npm run build
```
