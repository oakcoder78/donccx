import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function GoogleSyncModal({ isOpen, activityTitle, activityDate, onConfirm, onClose }) {
  const [time, setTime] = useState('09:00')

  if (!isOpen) return null

  const displayTitle = activityDate
    ? `${new Date(activityDate + 'T00:00:00').toLocaleDateString('pt-BR')} — ${activityTitle || 'atividade'}`
    : (activityTitle || 'Atividade')

  return (
    <Modal isOpen onClose={onClose} title="Sincronizar com Google Calendar" maxWidth="max-w-xs">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Defina a hora de início do evento:
        </p>

        <div>
          <label className="label-sm">Hora de início</label>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="input-base w-full"
            />
            <span className="text-xs text-text-tertiary whitespace-nowrap">Duração: 1h</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => onConfirm(time)} disabled={!time}>Confirmar</Button>
        </div>
      </div>
    </Modal>
  )
}
