const safeName = /^[a-z][a-z0-9_]*$/;
const safeLabel = /^[a-z][a-z0-9_]*$/;

export class Metrics {
  private readonly counters = new Map<string, number>();

  increment(name: string, labels: Record<string, string> = {}) {
    if (!safeName.test(name)) throw new Error("Invalid metric name.");
    const bounded = Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        if (!safeLabel.test(key) || value.length > 40)
          throw new Error("Invalid metric label.");
        return `${key}="${value.replaceAll('"', "")}"`;
      })
      .join(",");
    const key = `${name}{${bounded}}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  render() {
    return [...this.counters.entries()]
      .map(([key, value]) => `automation_${key} ${value}`)
      .join("\n");
  }
}
