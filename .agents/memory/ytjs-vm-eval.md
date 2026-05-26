---
name: youtubei.js v17 VM Evaluator Setup
description: How to properly configure the JavaScript evaluator for youtubei.js v17 so decipher() works in Node.js.
---

## The Problem
youtubei.js v17 `node.js` platform loads with a default `evaluate` function that throws "must provide own JavaScript evaluator". This causes `fmt.decipher()` to throw even inside try/catch in some cases.

## The Fix
Mutate `Platform.shim.eval` directly (do NOT call `Platform.load()` with only `eval` — that replaces the entire shim object, breaking fetch/crypto/etc.):

```typescript
import { Platform } from "youtubei.js";
import vm from "vm";

// Platform.shim is the module-level singleton from Utils.js
// Must provide globalThis in context so Object/Array/etc. are available
try {
  (Platform as any).shim.eval = async (code: string, env: Record<string, unknown>) => {
    const sandbox = vm.createContext({ ...globalThis, ...(env ?? {}) });
    return vm.runInContext(code, sandbox);
  };
} catch { /* shim not loaded yet */ }
```

**Why:** `Platform.load(platform)` does `shim = platform` (replaces entire object). Using `Platform.shim.eval = fn` mutates just the eval property while keeping fetch, crypto, Cache etc. intact. `vm.runInNewContext(code, {})` fails with "Unexpected identifier 'Object'" — must spread `globalThis`.

**Note:** Even with the evaluator, SABR-only tracks have `fmt.url = undefined` and decipher is not called — this only helps for cipher-protected tracks with actual URL data.
