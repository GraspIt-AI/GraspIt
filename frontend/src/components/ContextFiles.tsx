import { useRef } from 'react'

interface Props {
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}

const ACCEPTED = '.pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.csv,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm,image/*'

function fileIcon(file: File) {
  const mime = file.type
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime === 'application/pdf') return '📄'
  if (mime.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx')) return '📝'
  if (mime.includes('presentation') || file.name.endsWith('.ppt') || file.name.endsWith('.pptx')) return '📊'
  if (mime === 'text/csv' || file.name.endsWith('.csv')) return '📊'
  return '📎'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ContextFiles({ files, onAdd, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    onAdd(Array.from(e.target.files))
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((file, i) => (
            <li
              key={i}
              className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100"
            >
              <span className="text-xl shrink-0">{fileIcon(file)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
              </div>
              <button
                onClick={() => onRemove(i)}
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0 text-lg leading-none"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-colors text-sm"
      >
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
        </svg>
        <span>
          {files.length === 0 ? 'Attach slides, notes, or PDFs' : 'Add more files'}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        onChange={handleChange}
        className="hidden"
      />

      {files.length === 0 && (
        <p className="text-xs text-gray-400">
          Supports PDF, DOCX, PPTX, TXT, audio files (MP3, WAV, etc), images — any course material
        </p>
      )}
    </div>
  )
}
