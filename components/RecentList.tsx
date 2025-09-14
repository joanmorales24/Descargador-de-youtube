import React from 'react';
import type { RecentItem } from '../types';
import { ReloadIcon } from './icons/ReloadIcon';

interface RecentListProps {
  items: RecentItem[];
  onOpen?: (item: RecentItem) => void;
  onRedownload?: (item: RecentItem) => void;
  onDelete?: (id: string) => void;
}

export const RecentList: React.FC<RecentListProps> = ({ items, onOpen, onRedownload, onDelete }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-8 bg-gray-800/40 border border-gray-700/50 rounded-xl p-4">
      <h3 className="text-sm text-gray-400 mb-3">Descargas recientes</h3>
      <ul className="space-y-1 text-sm text-gray-300">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-2 justify-between group">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                title={r.href ? 'Abrir archivo' : 'Sin enlace'}
                onClick={() => r.href && onOpen && onOpen(r)}
                className={`text-left truncate hover:underline ${r.href ? 'text-blue-300 hover:text-blue-200' : 'text-gray-400 cursor-not-allowed'}`}
              >
                {r.name}
              </button>
              <button
                type="button"
                title={r.href ? 'Volver a descargar' : 'Sin enlace'}
                onClick={() => r.href && onRedownload && onRedownload(r)}
                className={`p-1 rounded ${r.href ? 'text-gray-300 hover:text-white hover:bg-gray-700/60' : 'text-gray-500 cursor-not-allowed'}`}
              >
                <ReloadIcon className="h-4 w-4" />
              </button>
            </div>
            <span className="text-gray-500 mr-1 whitespace-nowrap">{r.size ? `${Math.round(r.size/1024/1024)} MB` : ''}</span>
            <span className={`whitespace-nowrap ${r.status === 'ok' ? 'text-green-400' : r.status === 'cancel' ? 'text-yellow-400' : 'text-red-400'}`}>
              {r.status === 'ok' ? 'OK' : r.status === 'cancel' ? 'Cancelado' : 'Error'}
            </span>
            <button
              type="button"
              aria-label="Eliminar"
              onClick={() => onDelete && onDelete(r.id)}
              className="opacity-70 group-hover:opacity-100 text-gray-400 hover:text-red-300 px-2"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
