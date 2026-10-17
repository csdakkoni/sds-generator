# Reference cases

KDU-verified cases: a recipe and its expected classification. The engine is not considered changed until every case here passes (`npm test` runs them).

Add only cases the KDU has checked. One JSON file per case:

```json
{
  "name": "Short description",
  "verifiedBy": "KDU name",
  "verifiedAt": "2026-10-20",
  "input": {
    "components": [
      {
        "id": "1",
        "name": "Ingredient",
        "concentration": { "min": 10, "max": 20 },
        "hazardData": "classified",
        "classifications": [{ "category": "Eye Dam. 1", "hCode": "H318" }]
      }
    ],
    "measurements": { "physicalState": "liquid", "flashPointC": 100, "pH": 7, "metalCorrosion": "negative" }
  },
  "expected": { "hStatements": ["H318"], "pictograms": ["GHS05"], "signalWord": "danger" }
}
```

The input format is `MixtureInput` in `packages/classification-engine/src/types.ts`.
