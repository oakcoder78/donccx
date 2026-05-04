import { useState, useRef } from 'react'

export default function AttachmentInput({ onFilesChange, existingFiles = [] }) {

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

      {existingFiles.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-text-tertiary">
            Arquivos existentes
          </p>
          {existingFiles.map(file => (
            <div
              key={file.id}
              className="
                flex
                items-center
                justify-between
                gap-2
                border
                border-border-tertiary
                rounded-md
                px-2
                py-1
                bg-bg-secondary
              "
            >
              {/* File name */}
              <span
                className="
                  text-sm
                  text-text-primary
                  truncate
                  flex-1
                "
                title={file.file_name}
              >
                {file.file_name}
              </span>

              {/* Placeholder actions */}
              <div className="flex items-center gap-2">

                {/* Preview placeholder */}
                <span
                  className="
                    text-text-tertiary
                    text-xs
                    opacity-60
                  "
                  title="Preview disponível no modo visualização"
                >
                  👁
                </span>

                {/* Download placeholder */}
                <span
                  className="
                    text-text-tertiary
                    text-xs
                    opacity-60
                  "
                  title="Download disponível no modo visualização"
                >
                  ⬇
                </span>

              </div>

            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">

        <button
          type="button"
          onClick={openFileDialog}
          className="font-medium bg-donc-sky text-white rounded-md hover:bg-opacity-90 transition-colors px-3 py-2 text-sm"
        >
          Anexar
        </button>

        <span className="text-xs text-text-secondary">
          {selectedFiles.length === 0
            ? 'Nenhum arquivo selecionado'
            : `${selectedFiles.length} arquivo(s)`
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