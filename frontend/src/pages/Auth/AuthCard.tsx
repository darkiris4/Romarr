import type { ReactNode } from 'react'

interface AuthCardProps {
  heading: string
  children: ReactNode
}

export default function AuthCard({ heading, children }: AuthCardProps) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-header">
          <img src="/logo.png" alt="Romarr" className="login-logo" />
        </div>
        <div className="login-card-body">
          <h1 className="login-heading">{heading}</h1>
          {children}
        </div>
      </div>
      <div className="login-footer">&copy; 2010-{new Date().getFullYear()} - Romarr</div>
    </div>
  )
}
