import { OperationsConsole } from "./operations-console";

export default function OperationsPage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Operations</p>
        <h1>Inspect, replay, and measure automations.</h1>
        <p>
          Tenant-scoped traces are redacted before display. Replay remains
          disabled until a trace is loaded successfully.
        </p>
      </section>
      <OperationsConsole />
    </main>
  );
}
