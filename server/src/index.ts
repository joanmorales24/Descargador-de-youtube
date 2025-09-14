import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4000',
]);
app.use(cors({
    origin: (origin, callback) => {
        // Allow no origin (same-origin), Electron file://, and localhost origins
        if (!origin || origin === 'null') return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
        return callback(new Error(`CORS: Origin not allowed: ${origin}`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
})); // CORS configurado para el frontend (5173/5174)
app.use(express.json()); // Middleware para parsear JSON

// Helpers para localizar binarios (dev vs empaquetado) y asegurar permisos de ejecución
function getBinPaths() {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    const ensureExecutable = (p: string) => {
        try {
            // ¿Ya es ejecutable?
            fs.accessSync(p, fs.constants.X_OK);
            return p;
        } catch {}
        // Intentar chmod en sitio
        try {
            fs.chmodSync(p, 0o755);
            fs.accessSync(p, fs.constants.X_OK);
            return p;
        } catch {}
        // Copiar a un temporal y volver ejecutable
        try {
            const tmp = os.tmpdir();
            const base = path.basename(p);
            const tmpPath = path.join(tmp, `${Date.now()}-${Math.random().toString(16).slice(2)}-${base}`);
            // Leer y reescribir para evitar flags raros del asar/unpacked
            const buf = fs.readFileSync(p);
            fs.writeFileSync(tmpPath, buf);
            fs.chmodSync(tmpPath, 0o755);
            return tmpPath;
        } catch (e) {
            // Último recurso: retornar original (fallará y lo veremos en logs)
            return p;
        }
    };
    const platform = process.platform === 'win32' ? 'win' : (process.platform === 'darwin' ? 'mac' : 'linux');
    const candidates: string[] = [];
    const resBase = (process as any).resourcesPath;
    if (resBase) candidates.push(path.join(resBase, 'bin', platform)); // empaquetado
    const cwd = process.cwd();
    candidates.push(path.join(cwd, 'resources', 'bin', platform)); // raíz
    candidates.push(path.join(cwd, '..', 'resources', 'bin', platform)); // ejecutado desde server/
    const here = __dirname; // server/src o server/dist
    candidates.push(path.join(here, '..', '..', 'resources', 'bin', platform)); // server/dist -> raíz/resources
    candidates.push(path.join(here, '..', '..', '..', 'resources', 'bin', platform)); // server/src -> raíz/resources

    // Primer directorio existente
    let dir = candidates.find((d) => fs.existsSync(d));
    if (!dir) {
        // Fallback: ffmpeg-static si existe (dev)
        try {
            const ffstatic = require('ffmpeg-static');
            if (ffstatic) {
                // Colocar ffmpeg en el mismo dir que yt-dlp si existe
            }
        } catch {}
        // Último recurso: .venv/bin (legacy dev)
        dir = path.join(cwd, '..', '.venv', 'bin');
    }

    const yt = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const ff = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ytdlpPath = path.join(dir, yt);
    let ffmpegPath = path.join(dir, ff);
    if (!fs.existsSync(ffmpegPath)) {
        try {
            const ffstatic = require('ffmpeg-static');
            if (ffstatic && fs.existsSync(ffstatic)) ffmpegPath = ffstatic;
        } catch {}
    }
    return { ytdlpPath: ensureExecutable(ytdlpPath), ffmpegPath: ensureExecutable(ffmpegPath) };
}

// Ejecuta yt-dlp: si el binario es script (shebang), usa python3 como intérprete
function spawnYtDlp(args: string[]) {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const { ytdlpPath } = getBinPaths();
    // Intento directo primero (con binario standalone en macOS)
    try { return spawn(ytdlpPath, args); } catch {}
    // Fallback: ejecutar como script vía Python
    const candidates = [
        '/usr/bin/python3',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python',
    ];
    const py = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
    if (py) return spawn(py, [ytdlpPath, ...args]);
    return spawn('/usr/bin/env', ['python3', ytdlpPath, ...args]);
}

// Ruta de prueba para verificar que el servidor funciona (API)
app.get('/api/status', (_req, res) => {
    res.json({ ok: true, msg: '¡El servidor del descargador de YouTube está vivo! 🚀' });
});

// Healthcheck con modo verbose opcional para diagnósticos
app.get('/api/health', (req, res) => {
    const verbose = String(req.query.verbose || '').toLowerCase() === '1' || String(req.query.verbose || '').toLowerCase() === 'true';
    if (!verbose) return res.json({ ok: true });

    try {
        const { ytdlpPath, ffmpegPath } = getBinPaths();
        const details = {
            ok: true,
            port: PORT,
            cwd: process.cwd(),
            pid: process.pid,
            platform: process.platform,
            node: process.version,
            resourcesPath: (process as any).resourcesPath || null,
            bins: {
                ytdlpPath,
                ffmpegPath,
                ytdlpExists: fs.existsSync(ytdlpPath),
                ffmpegExists: fs.existsSync(ffmpegPath),
            },
            cors: {
                allowedOrigins: Array.from(allowedOrigins),
                note: 'También se permite origin null y cualquier http://localhost:PUERTO',
            },
            env: {
                ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE || null,
                PORT: process.env.PORT || null,
                NODE_ENV: process.env.NODE_ENV || null,
            },
        };
        res.json(details);
    } catch (e: any) {
        res.json({ ok: true, warn: 'Verbose health falló al recolectar detalles', error: e?.message || String(e) });
    }
});

// Servir UI estática si existe carpeta dist (modo producción empaquetado)
try {
    const uiDir = path.resolve(__dirname, '..', '..', 'dist');
    if (fs.existsSync(uiDir)) {
        app.use(express.static(uiDir));
        app.get('/', (_req, res2) => res2.sendFile(path.join(uiDir, 'index.html')));
    }
} catch {}

/*
 * --- PUNTOS DE CONEXIÓN (ENDPOINTS) DE LA API ---
 */

// Endpoint para obtener información del video
app.get('/api/info', async (req, res) => {
    const url = req.query.url as string;
    const debug = String(req.query.debug || '').toLowerCase() === '1' || String(req.query.debug || '').toLowerCase() === 'true';
    // Solo aceptar URLs de video individuales (sin parámetro 'list')
    if (!url || url.includes('list=')) {
        console.error('[API INFO] URL inválida o de playlist recibida:', url);
        return res.status(400).json({ error: 'Solo se aceptan URLs de videos individuales de YouTube.' });
    }
    try {
        // Ejecutar yt-dlp binario con salida JSON
    const ytdlp = spawnYtDlp(['-J', '--no-warnings', '--no-progress', url]);

        let out = '';
        let err = '';
        ytdlp.on('error', (spawnErr: any) => {
            console.error('[API INFO] yt-dlp spawn error:', spawnErr?.message || spawnErr);
            try { const { ytdlpPath } = getBinPaths(); return res.status(500).json({ error: 'No se pudo iniciar yt-dlp para info.', details: String(spawnErr?.message || spawnErr), ytdlpPath }); } catch {}
        });
        ytdlp.stdout.on('data', (data: Buffer) => {
            out += data.toString();
        });
        ytdlp.stderr.on('data', (data: Buffer) => {
            err += data.toString();
        });
    ytdlp.on('close', (code: number) => {
            if (code !== 0) {
        console.error('[API INFO] yt-dlp exited with code', code, err);
        if (debug) return res.status(500).json({ error: 'yt-dlp falló al obtener info.', code, stderr: err });
            }
            const raw = out.trim();
            let jsonText = raw;
            const first = raw.indexOf('{');
            const last = raw.lastIndexOf('}');
            if ((first !== -1 && last !== -1) && (first !== 0 || last !== raw.length - 1)) {
                jsonText = raw.slice(first, last + 1);
            }
            try {
                const info = JSON.parse(jsonText);
                if (Array.isArray(info.formats)) {
                    info.formats = info.formats.filter((f: any) => {
                        const isStoryboard = f.format_note === 'storyboard' || f.protocol === 'mhtml';
                        const hasVideo = f.vcodec && f.vcodec !== 'none';
                        const hasAudio = f.acodec && f.acodec !== 'none';
                        return !isStoryboard && (hasVideo || hasAudio);
                    });
                    if (info.formats.length === 0) {
                        return res.status(500).json({ error: 'No se encontraron formatos de video/audio válidos para este video.' });
                    }
                }
                return res.json(info);
            } catch (e: any) {
                console.error('[API INFO] Fallo al parsear JSON de yt-dlp:', e?.message);
                const details = [err, out].filter(Boolean).join('\n');
                return res.status(500).json({ error: 'Error al procesar la información del video.', details });
            }
        });
    } catch (error: any) {
        console.error('[API INFO] Error general:', error);
        res.status(500).json({ error: 'Error al obtener información del video.', details: error?.message || error });
    }
});

// Endpoint para descargar el video
app.get('/api/download', async (req, res) => {
    const url = req.query.url as string;
    const format_id = req.query.format_id as string;
    const ext = (req.query.ext as string | undefined)?.toLowerCase();
    const hasAudio = String(req.query.hasAudio || '').toLowerCase() === 'true';
    const audio = (req.query.audio as string | undefined)?.toLowerCase();
    const debug = String(req.query.debug || '').toLowerCase() === '1' || String(req.query.debug || '').toLowerCase() === 'true';

    if (!url) {
        return res.status(400).json({ error: 'URL de YouTube no válida.' });
    }

        try {
        // Ejecutar yt-dlp para descargar el video en el formato deseado y hacer streaming al cliente
        const { spawn } = require('child_process');
            const path = require('path');
            const { ytdlpPath, ffmpegPath } = getBinPaths();

            // Modo sólo audio MP3 de alta calidad (320kbps)
            if (audio === 'mp3') {
                // Escribimos a archivo temporal y luego lo servimos para evitar streams de 0 bytes
                const os = require('os');
                const fs = require('fs');
                const tmp = os.tmpdir();
                const outPath = path.join(tmp, `download-${Date.now()}.mp3`);

                const ytdlpArgs = ['-f', 'bestaudio', '-o', '-', '--no-progress', url];
                const ytdlp = spawnYtDlp(ytdlpArgs);

                const ffmpeg = spawn(ffmpegPath, [
                    '-hide_banner', '-loglevel', 'error',
                    '-i', 'pipe:0',
                    '-vn',
                    '-acodec', 'libmp3lame',
                    '-b:a', '320k',
                    '-y', outPath,
                ]);

                ytdlp.stdout.pipe(ffmpeg.stdin);

                let errLogs = '';
                ytdlp.stderr.on('data', (chunk: Buffer) => { errLogs += chunk.toString(); });
                ffmpeg.stderr.on('data', (chunk: Buffer) => { errLogs += chunk.toString(); });

                const cleanupAndSend = () => {
                    try {
                        const stat = fs.statSync(outPath);
                        res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
                        res.setHeader('Content-Type', 'audio/mpeg');
                        res.setHeader('Content-Length', String(stat.size));
                        const r = fs.createReadStream(outPath);
                        r.on('close', () => { try { fs.unlinkSync(outPath); } catch {} });
                        r.pipe(res);
                    } catch (e) {
                        console.error('[API DOWNLOAD][mp3] sending file failed:', e, errLogs);
                        if (!res.headersSent) res.status(500).json({ error: 'Error al generar MP3.' });
                        try { fs.unlinkSync(outPath); } catch {}
                    }
                };

                ytdlp.on('error', (err: Error) => {
                    console.error('[API DOWNLOAD][yt-dlp mp3] spawn error:', err);
                    if (!res.headersSent) res.status(500).json({ error: 'No se pudo iniciar yt-dlp para audio.' });
                });
                ffmpeg.on('error', (err: Error) => {
                    console.error('[API DOWNLOAD][ffmpeg mp3] spawn error:', err);
                    if (!res.headersSent) res.status(500).json({ error: 'No se pudo iniciar ffmpeg.' });
                });
        ffmpeg.on('close', (code: number) => {
                    if (code !== 0) {
                        console.error('[API DOWNLOAD][ffmpeg mp3] exited with code', code, errLogs);
            if (!res.headersSent) res.status(500).json({ error: 'Fallo al convertir a MP3.', code, stderr: errLogs });
                        try { require('fs').unlinkSync(outPath); } catch {}
                        return;
                    }
                    cleanupAndSend();
                });

                return; // no continuar
            }

            // Si el formato seleccionado no tiene audio, intentamos fusionar con el mejor audio
            // Elegimos contenedor según la extensión del formato seleccionado
            const container = ext === 'webm' ? 'webm' : 'mp4';
            let fExpr = format_id || 'best';
            if (format_id) {
                if (!hasAudio) {
                    const preferredAudio = container === 'webm' ? 'bestaudio[ext=webm]' : 'bestaudio[ext=m4a]';
                    const preferredVideo = container === 'webm' ? 'bestvideo[ext=webm]' : 'bestvideo[ext=mp4]';
                    // Orden: formato pedido + audio preferido -> formato pedido + cualquier audio -> formato pedido solo -> bestvideo preferido + audio preferido -> bestvideo+cualquier -> best
                    fExpr = `${format_id}+${preferredAudio}/` +
                            `${format_id}+bestaudio/` +
                            `${format_id}/` +
                            `${preferredVideo}+${preferredAudio}/` +
                            `bestvideo+bestaudio/` +
                            `best`;
                } else {
                    // Incluye audio; si falla, intentar best (con audio)
                    fExpr = `${format_id}/best`;
                }
            }

            const os = require('os');
            const fs = require('fs');
            const tmp = os.tmpdir();
            const extToMime: Record<string, string> = {
                mp4: 'video/mp4',
                m4a: 'audio/mp4',
                webm: 'video/webm',
                mkv: 'video/x-matroska',
                mp3: 'audio/mpeg',
                wav: 'audio/wav',
                ogg: 'audio/ogg',
            };
            const finalExt = fExpr.includes('+') ? container : (ext || 'bin');
            const outPath = path.join(tmp, `download-${Date.now()}.${finalExt}`);

            const ytdlpArgs = ['-f', fExpr, '-o', outPath, '--no-progress', '--ffmpeg-location', ffmpegPath];
            if (fExpr.includes('+')) {
                ytdlpArgs.push('--merge-output-format', container);
            }
            ytdlpArgs.push(url);
            const ytdlp = spawnYtDlp(ytdlpArgs);

            let errLogs = '';
            ytdlp.stderr.on('data', (chunk: Buffer) => { errLogs += chunk.toString(); });
            ytdlp.on('error', (err: Error) => {
                console.error('[API DOWNLOAD] spawn error:', err);
                if (!res.headersSent) res.status(500).json({ error: 'No se pudo iniciar la descarga.' });
            });
        ytdlp.on('close', (code: number) => {
                if (code !== 0) {
                    console.error('[API DOWNLOAD] yt-dlp exited with code', code, errLogs);
            if (!res.headersSent) return res.status(500).json({ error: 'Fallo al descargar el video.', code, stderr: errLogs, fExpr });
                    return;
                }
                try {
                    const stat = fs.statSync(outPath);
                    const mime = extToMime[finalExt as keyof typeof extToMime] || 'application/octet-stream';
                    const filename = `download.${finalExt}`;
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    res.setHeader('Content-Type', mime);
                    res.setHeader('Content-Length', String(stat.size));
                    const r = fs.createReadStream(outPath);
                    r.on('close', () => { try { fs.unlinkSync(outPath); } catch {} });
                    r.pipe(res);
                } catch (e) {
                    console.error('[API DOWNLOAD] sending file failed:', e, errLogs);
                    if (!res.headersSent) res.status(500).json({ error: 'Error al preparar el archivo.' });
                    try { fs.unlinkSync(outPath); } catch {}
                }
            });
    } catch (error) {
        console.error('Error al descargar el video:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Error al descargar el video.' });
    }
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    try {
        const fs = require('fs');
        const { ytdlpPath, ffmpegPath } = getBinPaths();
        const canY = (() => { try { fs.accessSync(ytdlpPath, fs.constants.X_OK); return true; } catch { return false; } })();
        const canF = (() => { try { fs.accessSync(ffmpegPath, fs.constants.X_OK); return true; } catch { return false; } })();
        console.log('[startup] ytdlpPath:', ytdlpPath, 'executable:', canY);
        console.log('[startup] ffmpegPath:', ffmpegPath, 'executable:', canF);
    } catch {}
});
