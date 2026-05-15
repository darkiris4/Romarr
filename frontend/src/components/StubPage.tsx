interface Props {
  title: string
}

export default function StubPage({ title }: Props) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      <small>Coming soon.</small>
    </div>
  )
}
