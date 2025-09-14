
import React, { useState } from 'react';
import { LinkIcon } from './icons/LinkIcon';

interface URLInputFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export const URLInputForm: React.FC<URLInputFormProps> = ({ onSubmit, isLoading }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(url);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <LinkIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=... o /shorts/..."
          disabled={isLoading}
          className="w-full bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 rounded-lg py-3 pl-11 pr-4 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition duration-200 ease-in-out disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center items-center bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-red-500 transition-all duration-200 ease-in-out disabled:bg-red-800 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Analizando...' : 'Obtener Video'}
      </button>
    </form>
  );
};
