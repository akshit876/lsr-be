# PLC writes reference – all bits and registers we write

This document lists **every** bit and register the application writes to the PLC (Modbus).

---

## 1. Bit writes (writeBit)

| Register | Bit | Value | Where | Purpose |
|----------|-----|--------|-------|---------|
| **1414** | **3** | 1 | scanCycles.js | Data **match** (OK) – after verification scan when scanner data matches code |
| **1414** | **4** | 1 | scanCycles.js | Data **mismatch** (NG) – after verification scan when data does not match |
| **1414** | **6** | 1 | scanCycles.js | First scan **OK** – part already marked / valid first scan |
| **1414** | **7** | 1 | scanCycles.js | First scan **NG** – timeout or NG response from first scanner |
| **1414** | **8** | 1 then 0 | scanUtils.js | Grade A/B/C – pulse (1 then 0 after 200 ms) |
| **1414** | **9** | 1 then 0 | scanUtils.js | Grade other (not A/B/C) – pulse (1 then 0 after 200 ms) |
| **1414** | **15** | 1 | scanCycles.js | Signal **file transfer** – after barcode written, before waiting for 1410.3 |
| **1415** | **0** | 1 | scanCycles.js | Trigger **first** scanner (via getScanRegister("first") → 1415, getScanBit("first") → 0) |
| **1415** | **9** | 1 | manualRunService.js | Manual run operation |
| **1416** | **15** | 1 | scanCycles.js | Trigger **verification** scanner (via getScanRegister("verification") → 1416, getScanBit("verification") → 15) |
| **1500** | **3** | 1 | scanCycles.js | **Reset** – on reset signal (handleReset, reset monitoring); then resetBits() runs |

**Note:** server.js can write an arbitrary bit via UI/socket: `writeModbusBit(address, bit, value)` → `writeBit(address, bit, value)` (any register/bit from client).

---

## 2. Register writes (writeRegister / resetSpecificBits)

These are used to **clear** bits by reading the register, masking off bits, and writing back (so we “write” the register with a new value).

| Register | Bits cleared | Where | Purpose |
|----------|----------------|-------|---------|
| **1414** | 3, 4, 6, 7 | scanCycles.js `resetBits()` | Reset OK/NG and scan result bits (1414.3, 1414.4, 1414.6, 1414.7) |
| **1415** | 4 | scanCycles.js `resetBits()` | Reset bit 4 in 1415 |

`resetBits()` calls:

- `resetSpecificBits(1414, [3, 4, 6, 7])`
- `resetSpecificBits(1415, [4])`

Each `resetSpecificBits(register, bitsToReset)` does: read register → clear listed bits → write register back.

---

## 3. Block register writes (writeRegisterFull + status)

| Start register | Count | Where | Purpose |
|----------------|--------|-------|---------|
| **3000** … **3000+N-1** | N (depends on scanner data length) | scanCycles.js `writeScannerDataToMultipleRegisters()` | Scanner data string written to consecutive registers (2 chars per register, or 1 char depending on config) |
| **2999** | 1 | scanCycles.js | **Status**: number of registers used (N) for the scanner data block above |

So we **write**:

- Registers **3000, 3001, …** with scanner data (ASCII).
- Register **2999** with the number of registers written (N).

---

## 4. Summary table – bits we set to 1

| Reg.Bit | Set when |
|---------|-----------|
| 1414.3 | Verification scan: data match (OK) |
| 1414.4 | Verification scan: data mismatch (NG) |
| 1414.6 | First scan OK (e.g. part already marked) |
| 1414.7 | First scan NG / timeout |
| 1414.8 | Grade A/B/C (pulsed) |
| 1414.9 | Grade other (pulsed) |
| 1414.15 | File transfer signal |
| 1415.0 | Trigger first scanner |
| 1415.9 | Manual run |
| 1416.15 | Trigger verification scanner |
| 1500.3 | Reset |

---

## 5. Other / test code (not main flow)

- **manualRunService.js**: `writeBit(address, bit, 1)` then optional `writeBit(address, bit, 0)` – address/bit from operation config.
- **testCycle.js**: 1410.0, 1410.11, 1414.6, 1414.7, 1414.3/4, etc. (test flow).
- **testRun.js**: `writeBitsWithRest(1417, 0, 1, 100, false)`.
- **server.js**: `writeRegister(register, intValue)` and `writeBit(address, bit, value)` for UI/socket-driven writes (arbitrary register/bit).

---

*Generated from codebase grep/search. Main app PLC IP: 192.168.3.147:502 (see services/modbus.js).*
