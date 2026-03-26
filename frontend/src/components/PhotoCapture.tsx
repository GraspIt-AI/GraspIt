import { useRef } from 'react'

interface Props {
  photos: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}

export default function PhotoCapture({ photos, onAdd, onRemove }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    onAdd(Array.from(e.target.files))
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {photos.map((file, i) => (
            <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <img
                src={URL.createObjectURL(file)}
                alt={`photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => onRemove(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Two buttons: camera + gallery */}
      <div className="flex gap-2">
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-colors text-sm"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
          <span>Take photo</span>
        </button>

        <button
          onClick={() => galleryRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-colors text-sm"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <span>Upload photo</span>
        </button>
      </div>

      {photos.length > 0 && (
        <p className="text-xs text-gray-400">{photos.length} photo{photos.length !== 1 ? 's' : ''} added</p>
      )}

      {/* Camera input — triggers camera on mobile */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />

      {/* Gallery input — opens photo library / file picker */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
