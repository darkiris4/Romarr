import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, ImageOff, X, Plus } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { platformsApi } from '../../api/platforms'
import AddGameModal from '../../pages/Games/AddGameModal'

export default function Header() {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0, width: 380 })
  const [showAdd, setShowAdd] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: suggestions = [] } = useQuery({
    queryKey: ['games-suggest', inputValue],
    queryFn: () => gamesApi.list({ search: inputValue }),
    enabled: focused && inputValue.length > 1,
    staleTime: 10_000,
  })

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
  })

  function updateCoords() {
    if (searchWrapRef.current) {
      const r = searchWrapRef.current.getBoundingClientRect()
      setDropdownCoords({ top: r.bottom + 4, left: r.left, width: Math.max(380, r.width) })
    }
  }

  function handleFocus() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    updateCoords()
    setFocused(true)
  }

  function handleBlur() {
    blurTimerRef.current = setTimeout(() => setFocused(false), 150)
  }

  function openAdd(query: string) {
    setFocused(false)
    setAddQuery(query)
    setShowAdd(true)
  }

  const trimmed = inputValue.trim()
  const showDropdown = focused && trimmed.length > 0

  return (
    <>
      <header className="topbar">
        <div className="search-wrapper" ref={searchWrapRef}>
          <Search size={13} className="search-icon" />
          <input
            className="topbar-search"
            placeholder="Search or add games…"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={e => {
              if (e.key === 'Escape') { setInputValue(''); setFocused(false) }
              if (e.key === 'Enter' && trimmed) openAdd(trimmed)
            }}
          />
          {inputValue && (
            <button className="search-clear" onClick={() => { setInputValue(''); setFocused(false) }} tabIndex={-1}>
              <X size={12} />
            </button>
          )}
        </div>
      </header>

      {showDropdown && createPortal(
        <div
          className="search-dropdown"
          style={{ position: 'fixed', top: dropdownCoords.top, left: dropdownCoords.left, width: dropdownCoords.width }}
          onMouseDown={e => e.preventDefault()}
        >
          {suggestions.slice(0, 5).map(g => (
            <div
              key={g.id}
              className="search-dropdown-row"
              onClick={() => { setInputValue(''); setFocused(false); navigate(`/games/${g.id}`) }}
            >
              <div className="search-dropdown-cover">
                {g.cover_url
                  ? <img src={g.cover_url} alt={g.title} />
                  : <div className="search-dropdown-cover--empty"><ImageOff size={10} /></div>
                }
              </div>
              <div className="search-dropdown-info">
                <span className="search-dropdown-title">{g.title}</span>
                <span className="search-dropdown-meta">
                  {g.platform?.name}{g.release_year ? ` · ${g.release_year}` : ''}
                </span>
              </div>
              <span className="search-dropdown-badge">In Library</span>
            </div>
          ))}

          <div className="search-dropdown-row search-dropdown-row--add" onClick={() => openAdd(trimmed)}>
            <div className="search-dropdown-cover search-dropdown-cover--add">
              <Plus size={13} />
            </div>
            <span className="search-dropdown-title">Search IGDB for "{trimmed}"</span>
          </div>
        </div>,
        document.body
      )}

      {showAdd && (
        <AddGameModal
          platforms={platforms}
          initialQuery={addQuery}
          onClose={() => { setShowAdd(false); setInputValue('') }}
          onAdded={(gameId) => { setShowAdd(false); setInputValue(''); navigate(`/games/${gameId}`) }}
        />
      )}
    </>
  )
}
