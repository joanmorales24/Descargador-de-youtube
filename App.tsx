import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { VideoInfo, VideoFormat, RecentItem } from './types';
import { URLInputForm } from './components/URLInputForm';
import { VideoPreviewCard } from './components/VideoPreviewCard';
import { Loader } from './components/Loader';
import { Modal } from './components/Modal';
import { YouTubeIcon } from './components/icons/YouTubeIcon';
import { RecentList } from './components/RecentList';

// Mock service to simulate fetching video data
const fetchMockVideoInfo = (url: string): Promise<VideoInfo> => {
  return new Promise((resolve, reject) => {
    // Regex to extract video ID from various YouTube URL formats including shorts
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    const videoId = match ? match[1] : null;

    const isShort = url.includes('/shorts/');

    setTimeout(() => {
      if (videoId) {
        resolve({
          id: videoId,
          title: isShort 
            ? 'Ejemplo de Título de YouTube Short' 
            : 'Ejemplo de Título de Video de YouTube Muy Largo para Probar el Diseño de la Interfaz',
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          author: 'Creador de Contenido Famoso',
          duration: isShort ? '0:45' : '10:32',
          formats: [
            {
              format_id: '18',
              ext: 'mp4',
              format_note: '360p',
              resolution: '640x360',
              vcodec: 'avc1.42001E',
              acodec: 'mp4a.40.2',
              filesize: 10485760,
              url: 'https://example.com/video.mp4',
            },
            {
              format_id: '140',
              ext: 'm4a',
              format_note: 'audio only',
              resolution: null,
              vcodec: 'none',
              acodec: 'mp4a.40.2',
              filesize: 2048000,
              url: 'https://example.com/audio.m4a',
            },
          ],
        });
      } else {
        reject(new Error('URL de YouTube no válida. Por favor, inténtalo de nuevo.'));
      }
    }, 1500); // Simulate network delay
  });
};


// Usa relativo en producción (misma origin) y URL absoluta en dev si se necesita
const API_URL = (import.meta as any).env?.DEV ? 'http://localhost:4000' : '';

const App: React.FC = () => {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadLabel, setDownloadLabel] = useState<string>('');
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  // Load recent from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('recent-downloads');
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized: RecentItem[] = parsed.map((it) => ({
            id: String(it.id ?? `${Date.now()}-${Math.random().toString(36).slice(2,8)}`),
            name: String(it.name ?? 'download'),
            size: Number(it.size ?? 0),
            type: String(it.type ?? 'application/octet-stream'),
            status: (it.status === 'ok' || it.status === 'error' || it.status === 'cancel') ? it.status : 'ok',
            href: typeof it.href === 'string' ? it.href : undefined,
            createdAt: Number(it.createdAt ?? Date.now()),
          }));
          normalized.sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
          setRecent(normalized.slice(0, 50));
        }
      }
    } catch {}
  }, []);

  // Persist recent to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('recent-downloads', JSON.stringify(recent));
    } catch {}
  }, [recent]);

  const upsertRecent = useCallback((item: RecentItem) => {
    setRecent(prev => {
      const next = [item, ...prev].slice(0, 100); // temp buffer
      next.sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      return next.slice(0, 50);
    });
  }, []);

  const handleFetchVideo = useCallback(async (url: string) => {
    if (!url) {
      setError('Por favor, introduce una URL de YouTube.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setVideoInfo(null);
    setVideoUrl(url);

    try {
      const response = await fetch(`${API_URL}/api/info?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        // Try to read JSON error with details
        let msg = 'Error al obtener la información del video.';
        try {
          const errorData = await response.json();
          msg = errorData.error || msg;
          if (errorData.details) msg += `\nDetalles: ${errorData.details}`;
          if (errorData.stderr) msg += `\nLog: ${errorData.stderr}`;
        } catch {}
        throw new Error(msg);
      }
      const data = await response.json();
      // Adapt backend yt-dlp info to VideoInfo for frontend
      const videoInfo: VideoInfo = {
        id: data.id,
        title: data.title,
        thumbnailUrl: data.thumbnail || data.thumbnailUrl || '',
        author: data.channel || data.uploader || '',
        duration: data.duration_string || (data.duration ? `${Math.floor(data.duration/60)}:${('0'+(data.duration%60)).slice(-2)}` : ''),
        formats: Array.isArray(data.formats)
          ? data.formats.map((f: any) => ({
              format_id: f.format_id,
              format_note: f.format_note,
              ext: f.ext,
              resolution: f.resolution,
              acodec: f.acodec,
              vcodec: f.vcodec,
              url: f.url,
              filesize: f.filesize_approx || f.filesize,
            }))
          : [],
      };
      setVideoInfo(videoInfo);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado.');
      }
      // Si hay fallo de red (Failed to fetch), intentar health verbose para diagnóstico
      try {
        const health = await fetch(`${API_URL}/api/health?verbose=1`).then(r => r.json());
        console.warn('Diagnóstico backend:', health);
      } catch {}
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const handleDownload = useCallback((format_id: string, ext?: string, hasAudio?: boolean) => {
  if (!videoUrl || !format_id) return;
  const params = new URLSearchParams({ url: videoUrl, format_id, debug: '1' });
  if (ext) params.set('ext', ext);
  if (typeof hasAudio !== 'undefined') params.set('hasAudio', String(hasAudio));
  const downloadUrl = `${API_URL}/api/download?${params.toString()}`;
  void downloadWithProgress(downloadUrl);
  }, [videoUrl]);
  
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleReset = useCallback(() => {
    setVideoInfo(null);
    setError(null);
    setVideoUrl('');
  }, []);

  const handleDownloadMp3 = useCallback(() => {
    if (!videoUrl) return;
    const params = new URLSearchParams({ url: videoUrl, audio: 'mp3', debug: '1' });
    const downloadUrl = `${API_URL}/api/download?${params.toString()}`;
    void downloadWithProgress(downloadUrl);
  }, [videoUrl]);

  const downloadWithProgress = useCallback(async (url: string) => {
    try {
      setError(null);
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadLabel('Preparando descarga…');
      // Abort controller para cancelar si fuera necesario
      const controller = new AbortController();
      downloadAbortRef.current = controller;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        // Intentar leer JSON de error con detalles
        let msg = `Error de descarga (HTTP ${response.status})`;
        try {
          const err = await response.json();
          msg = err.error || msg;
          if (err.stderr) msg += `\nLog: ${err.stderr}`;
        } catch {}
        throw new Error(msg);
      }
      const totalStr = response.headers.get('Content-Length');
      const total = totalStr ? parseInt(totalStr, 10) : 0;
      const cd = response.headers.get('Content-Disposition') || '';
      const ct = response.headers.get('Content-Type') || 'application/octet-stream';
  const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || 'download';
  const reader = response.body?.getReader();
      if (!reader) throw new Error('No se pudo leer el flujo de respuesta.');
      const chunks: Uint8Array[] = [];
      let received = 0;
      setDownloadLabel(filename);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (total > 0) {
            const pct = Math.max(0, Math.min(100, Math.round((received / total) * 100)));
            setDownloadProgress(pct);
          } else {
            setDownloadProgress(null); // indeterminado
          }
        }
      }
      const abChunks = chunks.map((u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as unknown as BlobPart);
      const blob = new Blob(abChunks as BlobPart[], { type: ct });
      const link = document.createElement('a');
      const href = URL.createObjectURL(blob);
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloadProgress(100);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullUrl = url.startsWith('http') ? new URL(url) : new URL(url, location.origin);
  const rel = `${fullUrl.pathname}${fullUrl.search}`; // store relative path
  const item: RecentItem = { id, name: filename, size: received, type: ct, status: 'ok', href: rel, createdAt: Date.now() };
  upsertRecent(item);
      setTimeout(() => {
        URL.revokeObjectURL(href);
        setIsDownloading(false);
        setDownloadProgress(null);
        setDownloadLabel('');
      }, 500);
    } catch (e) {
      const aborted = (e as any)?.name === 'AbortError';
      setIsDownloading(false);
      setDownloadProgress(null);
      if (aborted) {
        setError('Descarga cancelada.');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: RecentItem = { id, name: downloadLabel || 'download', size: 0, type: 'application/octet-stream', status: 'cancel', createdAt: Date.now() };
  upsertRecent(item);
      } else if (e instanceof Error) {
        setError(e.message);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: RecentItem = { id, name: downloadLabel || 'download', size: 0, type: 'application/octet-stream', status: 'error', createdAt: Date.now() };
  upsertRecent(item);
      } else {
        setError('Fallo en la descarga.');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: RecentItem = { id, name: downloadLabel || 'download', size: 0, type: 'application/octet-stream', status: 'error', createdAt: Date.now() };
  upsertRecent(item);
      }
    } finally {
      downloadAbortRef.current = null;
    }
  }, []);

  // Handlers for recent list
  const handleRecentRedownload = useCallback((item: RecentItem) => {
    if (item.href) {
      const full = item.href.startsWith('/api/') ? `${API_URL}${item.href}` : item.href;
      void downloadWithProgress(full);
    } else {
      setError('No hay enlace para re-descargar este elemento.');
    }
  }, [downloadWithProgress]);

  const handleRecentDelete = useCallback((id: string) => {
    setRecent(prev => prev.filter(it => it.id !== id));
  }, []);

  const handleRecentOpen = useCallback(async (item: RecentItem) => {
    try {
      if (!item.href) throw new Error('Sin enlace para abrir.');
      const full = item.href.startsWith('/api/') ? `${API_URL}${item.href}` : item.href;
      const res = await fetch(full);
      if (!res.ok) throw new Error('No se pudo obtener el archivo.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // optional revoke later
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      // Fallback: re-descargar
      handleRecentRedownload(item);
    }
  }, [handleRecentRedownload]);

  const cancelDownload = useCallback(() => {
    try {
      downloadAbortRef.current?.abort();
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 selection:bg-red-500/30">
      <main className="w-full max-w-2xl mx-auto space-y-8">
        <header className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4">
            <YouTubeIcon className="h-16 w-16 text-red-600" />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-red-500 to-white text-transparent bg-clip-text">
              Descargador de Video
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Pega el enlace de un video o Short de YouTube para empezar.
          </p>
        </header>
        
  <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-2xl shadow-red-900/10 border border-gray-700/50">
          {!videoInfo && (
            <URLInputForm onSubmit={handleFetchVideo} isLoading={isLoading} />
          )}

          {isLoading && <Loader />}
          
          {error && !isLoading && (
             <div className="text-center text-red-400 bg-red-900/20 p-4 rounded-lg">
                <p>{error}</p>
             </div>
          )}

          {videoInfo && !isLoading && (
            <VideoPreviewCard 
              videoInfo={videoInfo} 
              onDownload={handleDownload}
              onDownloadMp3={handleDownloadMp3}
              onReset={handleReset}
              downloading={isDownloading}
              progress={downloadProgress}
              progressLabel={downloadLabel}
              onCancel={cancelDownload}
            />
          )}
        </div>

        {/* Recent list visible on main screen as well */}
        <RecentList 
          items={recent}
          onOpen={handleRecentOpen}
          onRedownload={handleRecentRedownload}
          onDelete={handleRecentDelete}
        />

    <footer className="text-center text-gray-500 text-sm">
      <p>&copy; {new Date().getFullYear()} Programado por Joan Morales.</p>
    </footer>
      </main>

      <Modal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        title="Funcionalidad de Demostración"
      >
        <p className="text-gray-300">
          Esta es una demostración de la interfaz de usuario. En una aplicación real, aquí comenzaría la descarga del video.
        </p>
        <p className="mt-4 text-gray-400 text-sm">
          Debido a las políticas de seguridad de los navegadores web (como CORS), una aplicación de frontend no puede descargar directamente videos de YouTube. Se requiere un servicio de <span className="font-semibold text-teal-400">backend</span> para procesar la solicitud, obtener el video y enviarlo al usuario.
        </p>
      </Modal>
    </div>
  );
};

export default App;
