import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@resumora/contracts';

type Connection = 'checking' | 'connected' | 'unavailable';

function isHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== 'object') return false;
  const health = value as Partial<HealthResponse>;
  return health.status === 'ok' && health.service === 'resumora-api'
    && health.environment === 'development'
    && health.capabilities?.authentication === 'not_implemented'
    && health.capabilities.database === 'not_connected'
    && typeof health.requestId === 'string';
}

export function App() {
  const [connection, setConnection] = useState<Connection>('checking');
  const checkConnection = useCallback(async (signal?: AbortSignal) => {
    setConnection('checking');
    try {
      const response = await fetch('/v1/health', { cache: 'no-store', signal });
      const health: unknown = await response.json();
      setConnection(response.ok && isHealthResponse(health) ? 'connected' : 'unavailable');
    } catch {
      if (!signal?.aborted) setConnection('unavailable');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkConnection(controller.signal);
    return () => controller.abort();
  }, [checkConnection]);

  const connectionLabel = {
    checking: 'Verificăm conexiunea locală…',
    connected: 'Frontendul comunică cu API-ul local',
    unavailable: 'API-ul local nu este disponibil',
  }[connection];

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Resumora, pagina de dezvoltare"><span aria-hidden="true">R</span>Resumora</a>
        <span className="badge">Dezvoltare locală</span>
      </header>
      <main>
        <section className="intro" aria-labelledby="title">
          <p className="eyebrow">O bază pentru următorul pas</p>
          <h1 id="title">Începem cu o conexiune locală între aplicație și API.</h1>
          <p className="lead">Acesta este mediul de dezvoltare Resumora. Păstrează pregătirea tehnică separată de datele și conturile reale.</p>
        </section>
        <section className="connection card" aria-labelledby="connection-title">
          <div>
            <p className="eyebrow">Conexiune</p>
            <h2 id="connection-title" role="status" aria-live="polite">{connectionLabel}</h2>
            <p>{connection === 'connected'
              ? 'Verificarea de sănătate a răspuns. Nu a fost contactat niciun serviciu Supabase.'
              : 'Pornește frontendul și Workerul folosind comanda de dezvoltare din ghid.'}</p>
          </div>
          <button onClick={() => void checkConnection()} disabled={connection === 'checking'}>Verifică din nou</button>
        </section>
        <section className="grid" aria-label="Starea funcțiilor">
          <article className="card"><span className="badge good">Pregătit local</span><h2>Frontend și Worker</h2><p>Aplicația folosește un API local prin aceeași origine de dezvoltare.</p></article>
          <article className="card"><span className="badge pending">Neimplementat</span><h2>Autentificare</h2><p>Înregistrarea, conectarea și resetarea parolei nu sunt active. Nu introduce date de autentificare aici.</p></article>
          <article className="card"><span className="badge pending">Neconectat</span><h2>Bază de date</h2><p>Arhitectura Supabase urmează să fie aprobată înainte de implementarea și aplicarea migrărilor.</p></article>
        </section>
        <p className="footnote">Acest mediu nu trimite emailuri, nu creează conturi și nu generează CV-uri. Limba interfeței nu stabilește limba viitorului CV.</p>
      </main>
    </>
  );
}
