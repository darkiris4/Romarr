import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Header() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) navigate(`/games?search=${encodeURIComponent(query.trim())}`)
  }

  return (
    <header className="topbar">
      <form onSubmit={handleSearch}>
        <div className="search-wrapper">
          <Search size={13} className="search-icon" />
          <input
            className="topbar-search"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </form>
    </header>
  )
}
