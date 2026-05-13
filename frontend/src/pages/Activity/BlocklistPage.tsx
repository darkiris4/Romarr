import { Ban } from 'lucide-react'

export default function BlocklistPage() {
  return (
    <div className="activity-page">
      <div className="activity-toolbar">
        <span className="activity-title">Blocklist</span>
        <span className="activity-count">0</span>
      </div>

      <div className="table-wrap">
        <table className="activity-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Release</th>
              <th>Indexer</th>
              <th>Protocol</th>
              <th>Date Added</th>
              <th />
            </tr>
          </thead>
          <tbody />
        </table>
      </div>

      <div className="empty-state" style={{ marginTop: 0 }}>
        <Ban size={48} />
        <p>Blocklist is empty</p>
        <small>Releases marked as failed or unwanted will appear here.</small>
      </div>
    </div>
  )
}
