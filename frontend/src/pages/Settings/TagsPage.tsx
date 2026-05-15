import { useState } from 'react'
import { X, Plus, Tag } from 'lucide-react'

interface TagItem {
  id: number
  label: string
}

let nextId = 1

export default function TagsPage() {
  const [tags, setTags] = useState<TagItem[]>([])
  const [input, setInput] = useState('')

  function addTag() {
    const label = input.trim()
    if (!label) return
    if (tags.some(t => t.label.toLowerCase() === label.toLowerCase())) {
      setInput('')
      return
    }
    setTags(prev => [...prev, { id: nextId++, label }])
    setInput('')
  }

  function deleteTag(id: number) {
    setTags(prev => prev.filter(t => t.id !== id))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
  }

  return (
    <div>
      <div className="settings-section-title">Tags</div>
      <div className="settings-section-desc">
        Tags let you organise games into custom groups — use them in list sources, search filters, and notifications.
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Add Tag</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="form-control"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Favourites, Multiplayer, JRPG"
            style={{ maxWidth: 320 }}
            autoFocus
          />
          <button className="btn btn-primary" onClick={addTag} disabled={!input.trim()}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {tags.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 0, padding: '48px 0' }}>
          <Tag size={40} />
          <p>No tags yet</p>
          <small>Tags appear here once added and can be applied to games in your library.</small>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tags</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tags.length} tag{tags.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {tags.map(tag => (
              <span key={tag.id} className="tag-chip">
                {tag.label}
                <button
                  className="tag-chip-remove"
                  title={`Remove "${tag.label}"`}
                  onClick={() => deleteTag(tag.id)}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
