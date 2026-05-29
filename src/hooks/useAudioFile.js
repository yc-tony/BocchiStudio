import { useCallback } from 'react'

// Loads a user-selected audio file into an in-memory Blob URL.
export function useAudioFile() {
  const loadFromFile = useCallback((file) => ({
    blob: file,
    objectUrl: URL.createObjectURL(file),
    title: file.name.replace(/\.\w+$/, ''),
  }), [])

  return { loadFromFile }
}
