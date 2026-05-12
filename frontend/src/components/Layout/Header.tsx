import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
}

export default function Header({ title }: Props) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/games?search=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <header className="topbar">
      <span className="topbar-title">{title}</span>
      <form onSubmit={handleSearch}>
        <div className="search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            className="topbar-search"
            placeholder="Search games…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </form>
    </header>
  )
}
