import { useState } from 'react'

interface Props {
  front: string
  back: string
  index: number
  total: number
}

export default function FlashCard({ front, back, index, total }: Props) {
  const [flipped, setFlipped] = useState(false)

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-gray-400">{index + 1} / {total}</p>
      <div
        className="w-full cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '160px',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl bg-indigo-600 text-white flex items-center justify-center p-6 text-center font-medium text-lg"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {front}
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl bg-white border border-indigo-100 shadow-inner text-gray-800 flex items-center justify-center p-6 text-center"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {back}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400">{flipped ? 'Answer' : 'Tap to reveal answer'}</p>
    </div>
  )
}
