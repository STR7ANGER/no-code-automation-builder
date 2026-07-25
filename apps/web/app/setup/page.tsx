import Link from "next/link";
import { SetupConsole } from "./setup-console";

export default function SetupPage() {
  return (
    <main id="content">
      <nav>
        <Link className="brand" href="/">
          RELAY<span>FLOW</span>
        </Link>
        <div className="nav-links">
          <Link href="/">Overview</Link>
          <Link href="/builder">Visual builder</Link>
        </div>
      </nav>
      <header className="page-header">
        <p className="eyebrow">TENANT CONTROL / LEAST PRIVILEGE</p>
        <h1>Secure the workspace.</h1>
        <p className="lede">
          Bootstrap one isolated tenant, retain the owner key once, and encrypt
          connector credentials before building.
        </p>
      </header>
      <SetupConsole />
    </main>
  );
}
