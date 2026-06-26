@AGENTS.md

## Code Review / Audit Rules

Before declaring two functions duplicate, a symbol dead, or an export unused:
1. Read the **full body** of every implementation — not just the signature or grep output.
2. Check **every call site** for the symbol before calling it unused.
3. Grep shows existence, not behavior. Comprehension first, finding second.
