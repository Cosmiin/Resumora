# Auditable cost scenarios

Current owner-relayed operating assumptions are in `assumptions-v1.2.json`; scenario outputs are in `results-v1.2.json`, `costs-v1.2.csv`, and `free-pilot-v1.2.json`. Reproduction uses the versioned Decimal model and free-pilot arithmetic scripts:

```sh
python3 research/costs/model_v1_2.py
python3 research/costs/free_pilot_v1_2.py
```

These are modeled scenarios, not provider invoices, measured demand, budgets, product prices, or infrastructure approval. Paid model inference is not zero-cost on free infrastructure; runtime and burst capacity remain unproven. The [strategy cost note](../strategy/publication/research/strategy/iteration2/cost-implications.md) summarizes how new journey actions affect modeled assumptions. Sources are dated in [`research/architecture/sources.md`](../architecture/sources.md).
