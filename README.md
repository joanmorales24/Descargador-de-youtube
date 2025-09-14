# Descargador YouTube (Electron)

Aplicación de escritorio para descargar videos de YouTube como MP4 (video+audio) o MP3 (320 kbps). Funciona 100% local, sin backend en la nube, usando yt-dlp y ffmpeg embebidos.

## Características

- Descarga MP4 con audio (mezcla automática con ffmpeg)
- Descarga MP3 a 320 kbps
- Barra de progreso y cancelación
- Lista de descargas recientes: abrir, re-descargar y eliminar (persistente)
- App de escritorio con Electron (React + Vite + Express)

## Requisitos

- Node.js 18+ (LTS recomendado)
- macOS o Windows

## Desarrollo local

1) Instalar dependencias

    npm install

2) Ejecutar en modo desarrollo (Electron + servidor + UI)

    npm run dev:electron

La app levanta un servidor local y abre la ventana de Electron con la UI.

## Generar instaladores

- macOS (arquitectura actual):

   npm run dist:mac

- macOS x64 (desde Mac con Node x64):

   npm run dist:mac:x64

- Windows x64 (cross-compile desde macOS soportado por electron-builder):

   npm run dist:win:x64

- Windows arm64:

   npm run dist:win:arm64

Los artefactos (.dmg / .exe) quedan en la carpeta `dist/`.

## Notas

- Los binarios `yt-dlp` y `ffmpeg` se preparan automáticamente con:

   npm run setup:binaries

- No se suben a Git los instaladores ni binarios (ver `.gitignore`).

## Licencia

Uso personal/educativo. Respeta los términos de servicio de YouTube y las leyes locales al descargar contenido.
