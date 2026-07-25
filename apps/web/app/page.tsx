import Link from "next/link";

export default function Home() {
  return (
    <main id="content">
      <nav>
        <Link className="brand" href="/">
          RELAY<span>FLOW</span>
        </Link>
        <div className="nav-links">
          <Link href="/setup">Workspace setup</Link>
          <Link href="/builder">Visual builder</Link>
          <a href="#principles">How it works</a>
        </div>
      </nav>
      <section className="hero">
        <div>
          <p className="eyebrow">DURABLE AUTOMATION / VISUALLY COMPOSED</p>
          <h1>
            Draw the logic.
            <br />
            <em>Run the work.</em>
          </h1>
          <p className="lede">
            Typed triggers, branches, loops, and actions—versioned before they
            touch production and traceable after they run.
          </p>
          <Link className="primary" href="/setup">
            Create a workspace <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <aside className="diagram-card" aria-label="Example automation graph">
          <div className="node trigger">01 / WEBHOOK</div>
          <div className="connector">↓</div>
          <div className="node condition">02 / AMOUNT &gt; 1000?</div>
          <div className="branch-row">
            <div>
              <span>TRUE</span>
              <div className="node action">REQUEST APPROVAL</div>
            </div>
            <div>
              <span>FALSE</span>
              <div className="node action">SEND RECEIPT</div>
            </div>
          </div>
        </aside>
      </section>
      <section id="principles" className="feature-grid">
        <article>
          <b>01</b>
          <h2>Typed before saved</h2>
          <p>
            Every node, edge, branch, and configuration crosses one contract.
          </p>
        </article>
        <article>
          <b>02</b>
          <h2>Drafts stay drafts</h2>
          <p>
            Editing never mutates the immutable version running in production.
          </p>
        </article>
        <article>
          <b>03</b>
          <h2>Failures stay visible</h2>
          <p>
            Retries and delayed steps remain durable, bounded, and inspectable.
          </p>
        </article>
      </section>
    </main>
  );
}
