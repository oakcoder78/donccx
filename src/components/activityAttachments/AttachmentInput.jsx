import { useState, useRef } from 'react'

export default function AttachmentInput({ onFilesChange }) {

  const [selectedFiles, setSelectedFiles] = useState([])
  const fileInputRef = useRef(null)

  function handleFileChange(event) {

    const files = Array.from(event.target.files)

    if (files.length > 5) {
      alert('Máximo de 5 arquivos permitido')
      return
    }

    setSelectedFiles(files)

    if (onFilesChange) {
      onFilesChange(files)
    }

  }

  function openFileDialog() {
    fileInputRef.current.click()
  }

  return (

    <div>

      <label className="label-sm">
        Anexos
      </label>

      <div className="flex items-center gap-2 mt-1">

        <button
          type="button"
          onClick={openFileDialog}
          className="inline-flex items-center gap-2 font-medium rounded-md border border-border-secondary px-3 py-2 text-sm bg-background-secondary hover:bg-background-tertiary"
        >
          Escolher arquivos
        </button>

        <span className="text-sm text-text-secondary">
          {selectedFiles.length === 0
            ? 'Nenhum arquivo escolhido'
            : `${selectedFiles.length} arquivo(s) selecionado(s)`
          }
        </span>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

      </div>

      {selectedFiles.length > 0 && (

        <div className="mt-2 space-y-1">

          {selectedFiles.map((file, index) => (

            <div
              key={index}
              className="text-sm text-text-primary"
            >
              {file.name}
            </div>

          ))}

        </div>

      )}

    </div>

  )

}