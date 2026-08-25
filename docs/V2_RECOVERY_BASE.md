# V2 Stable Recovery Base

Canonical visual baseline: `ui/redesign-from-actor-approval` at commit `e14764acc98b685bd2602d0bcb1a00ff1062fbbd`.

This branch preserves the approved redesigned interface, including the structured quotation editor used for Leader Fort quotation `ARK-QT-2026-0024`.

Rules for the recovery:

1. The approved UI is preserved as the visual constitution baseline.
2. Existing quotation/document/print behavior from this baseline must not be replaced by the legacy interface.
3. V2 domain, security, audit, permission, and print-rule improvements are ported into this branch selectively.
4. No UI replacement from `v2-system-constitution` is allowed unless it is proven to be compatible with this approved interface.
5. Production is not changed until this branch is visually and functionally verified.
