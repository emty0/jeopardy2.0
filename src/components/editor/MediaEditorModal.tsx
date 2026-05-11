import { Modal } from '../ui/Modal'
import { ImageEditor } from './ImageEditor'
import { VideoEditor } from './VideoEditor'
import { AudioEditor } from './AudioEditor'

interface Props {
  open: boolean
  url: string
  type: 'image' | 'video' | 'audio' | 'youtube'
  onClose: () => void
  onSaved: (newUrl: string, newType?: 'image' | 'video' | 'audio') => void
}

export function MediaEditorModal({ open, url, type, onClose, onSaved }: Props) {
  const isEditable = type === 'image' || type === 'video' || type === 'audio'
  const title =
    type === 'image'
      ? 'Bild bearbeiten'
      : type === 'video'
        ? 'Video bearbeiten'
        : type === 'audio'
          ? 'Audio bearbeiten'
          : 'Medium'

  return (
    <Modal open={open && isEditable} onClose={onClose} title={title} size="xl">
      {type === 'image' && (
        <ImageEditor
          initialUrl={url}
          onSaved={newUrl => {
            onSaved(newUrl, 'image')
            onClose()
          }}
          onCancel={onClose}
        />
      )}
      {type === 'video' && (
        <VideoEditor
          initialUrl={url}
          onSaved={(newUrl, newType) => {
            onSaved(newUrl, newType)
            onClose()
          }}
          onCancel={onClose}
        />
      )}
      {type === 'audio' && (
        <AudioEditor
          initialUrl={url}
          onSaved={newUrl => {
            onSaved(newUrl, 'audio')
            onClose()
          }}
          onCancel={onClose}
        />
      )}
    </Modal>
  )
}
