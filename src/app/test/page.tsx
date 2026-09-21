
export default function TestPage() {
  return (
    <div style={{ padding: '2rem', backgroundColor: '#f0f9ff', color: '#0369a1', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ margin: 0 }}>✅ 12Labs Studio System Test</h1>
      <p>If you see this page, the Next.js server is successfully running and routing is operational.</p>
      <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <strong>Diagnostic Info:</strong>
        <ul style={{ marginTop: '0.5rem' }}>
          <li>Status: Online</li>
          <li>Path: /test</li>
          <li>Time: {new Date().toISOString()}</li>
        </ul>
      </div>
    </div>
  );
}
