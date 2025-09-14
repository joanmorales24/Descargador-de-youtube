import React, { useState } from 'react';
import type { VideoInfo, VideoFormat, RecentItem } from '../types';
import { ReloadIcon } from './icons/ReloadIcon';
import { DownloadIcon } from './icons/DownloadIcon';

interface VideoPreviewCardProps {
  videoInfo: VideoInfo;
  onDownload: (format_id: string, ext?: string) => void;
  onDownloadMp3: () => void;
  onReset: () => void;
  downloading?: boolean;
  progress?: number | null; // null => indeterminado
  progressLabel?: string;
  onCancel?: () => void;
  // recent list moved to main screen (RecentList component)
}

export const VideoPreviewCard: React.FC<VideoPreviewCardProps> = (props) => {
  const { videoInfo, onDownload, onDownloadMp3, onReset, downloading, progress, progressLabel, onCancel } = props;
  const [selectedFormat, setSelectedFormat] = useState(videoInfo.formats[0]?.format_id || '');

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-1/3 flex-shrink-0">
          <img 
            src={videoInfo.thumbnailUrl} 
            alt={videoInfo.title} 
            className="rounded-lg shadow-lg w-full aspect-video object-cover" 
          />
        </div>
        <div className="flex-grow space-y-2">
          <h2 className="text-xl font-bold text-gray-100">{videoInfo.title}</h2>
          <p className="text-sm text-gray-400">por {videoInfo.author}</p>
          <p className="text-sm text-gray-400">Duración: {videoInfo.duration}</p>
        </div>
      </div>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="format" className="block text-sm font-medium text-gray-300 mb-2">
            Seleccionar Formato/Calidad
          </label>
          <select
            id="format"
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg py-2 px-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition duration-200"
          >
            {videoInfo.formats.map(f => (
              <option key={f.format_id} value={f.format_id}>
                {f.format_note || f.resolution || f.ext} {f.vcodec !== 'none' ? '🎬' : ''} {f.acodec !== 'none' ? '🔊' : ''} {f.ext} {f.filesize ? `(${Math.round(f.filesize/1024/1024)} MB)` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => {
                const fmt = videoInfo.formats.find(f => f.format_id === selectedFormat);
                const hasAudio = (fmt?.acodec && fmt.acodec !== 'none') ? true : false;
                onDownload(selectedFormat, fmt?.ext, hasAudio);
              }}
              disabled={!!downloading}
              className="flex-1 flex justify-center items-center gap-2 bg-red-600 disabled:bg-red-900/60 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-red-500 transition-all duration-200"
            >
              <DownloadIcon className="h-5 w-5" />
              Descargar
            </button>
            <button
              onClick={onDownloadMp3}
              disabled={!!downloading}
              className="flex-1 flex justify-center items-center gap-2 bg-green-600 disabled:bg-green-900/60 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500 transition-all duration-200"
            >
              <DownloadIcon className="h-5 w-5" />
              Descargar MP3 320kbps
            </button>
             <button
              onClick={onReset}
              className="flex-1 flex justify-center items-center gap-2 bg-gray-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500 transition-all duration-200"
            >
              Buscar Otro Video
            </button>
        </div>

        {downloading && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-300">
              <span>{progressLabel || 'Descargando…'}</span>
              <div className="flex items-center gap-3">
                <span>{typeof progress === 'number' ? `${progress}%` : '...'}</span>
                <button onClick={onCancel} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs">Cancelar</button>
              </div>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-3 bg-red-500 transition-all duration-200"
                style={{ width: typeof progress === 'number' ? `${progress}%` : '100%', opacity: progress == null ? 0.5 : 1 }}
              />
            </div>
          </div>
        )}

  {/* Recent list moved out; see RecentList on the main screen */}
      </div>
    </div>
  );
}
