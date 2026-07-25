import Link from "next/link";
import { BuilderCanvas } from "./builder-canvas";

export default function BuilderPage() {
  return (
    <main id="content">
      <nav>
        <Link className="brand" href="/">
          RELAY<span>FLOW</span>
        </Link>
        <div className="nav-links">
          <Link href="/">Overview</Link>
          <Link href="/setup">Workspace setup</Link>
        </div>
      </nav>
      <header className="page-header">
        <p className="eyebrow">DRAFT CANVAS / OPTIMISTIC REVISION</p>
        <h1>Compose the workflow.</h1>
        <p className="lede">
          Connect typed nodes, inspect publish diagnostics, autosave safely, and
          undo local changes without mutating an active version.
        </p>
      </header>
      <BuilderCanvas />
    </main>
  );
}
