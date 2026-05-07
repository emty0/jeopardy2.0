import { Modal } from '../ui/Modal'
import { ImageEditor } from './ImageEditor'
import { VideoEditor } from './VideoEditor'

interface Props {
  open: boolean
  url: string
  type: 'image' | 'video' | 'audio' | 'youtube'
  onClose: () => void
  onSaved: (newUrl: string, newType?: 'image' | 'video' | 'audio') => void
}

export function MediaEditorModal({ open, url, type, onClose, onSaved }: Props) {
  const isEditable = type === 'image' || type === 'video'
  const title = type === 'image' ? 'Bild bearbeiten' : type === 'video' ? 'Video bearbeiten' : 'Medium'

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
    </Modal>
  )
}
