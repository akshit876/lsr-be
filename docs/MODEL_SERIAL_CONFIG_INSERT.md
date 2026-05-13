# Manually insert into modelSerialConfig

Use this when the collection was cleared and you need one seed document so serial numbers work again.

---

## Option 1: Run the script (recommended)

From project root:

```bash
# Default: model FLYWHEEL-K10, last used 220 → next 0221 (no reset today)
node scripts/insert-modelSerialConfig.js

# Custom model
MODEL_NUMBER=CMB-778 node scripts/insert-modelSerialConfig.js

# Start from a specific “last used” (e.g. 5 → next will be 0006)
MODEL_NUMBER=FLYWHEEL-K10 CURRENT_VALUE=5 node scripts/insert-modelSerialConfig.js
```

---

## Option 2: MongoDB Shell (mongosh) or Compass

1. Connect to your MongoDB (e.g. `mongodb://localhost:27017`).
2. Use database **`main-data`**, collection **`modelSerialConfig`**.
3. Insert one document (change `modelNumber` if needed):

```javascript
db.modelSerialConfig.insertOne({
  modelNumber: "FLYWHEEL-K10",
  currentValue: "220",
  startingSerial: 1,
  lastUpdated: new Date(),
  updatedAt: new Date(),
  lastReset: new Date()
});
```

- **modelNumber** – Must match the model in your `config.currentModelConfig.modelNumber` (e.g. `FLYWHEEL-K10`, `CMB-778`, `CMB-877`).
- **currentValue** – Last *used* serial (string). Next serial will be `currentValue + 1`. Use `"0"` to get **0001** next; use `"220"` so next is **0221** and it won’t reset today.
- **startingSerial** – Use `701` only for **CMB-877**; use `1` for all other models.
- **lastReset** – Set to `new Date()` so the app doesn’t trigger another reset immediately.

---

## One document per model

Create one document per model number you use. The app looks up by `config.currentModelConfig.modelNumber` and uses the matching document in `modelSerialConfig`.
