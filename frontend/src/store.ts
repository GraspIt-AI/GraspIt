export interface Flashcard {
  front: string
  back: string
}

export interface LectureResults {
  flashcards: Flashcard[]
  notes: string
  transcript: string
  title?: string
  summary?: string
  tags?: string[]
}

// Simple module-level store to pass results between routes
let results: LectureResults | null = null

export function setResults(data: LectureResults) {
  results = data
}

export function getResults(): LectureResults | null {
  return results
}
