# PAT Bible Agent Rules

These rules apply to all Codex/Codex Code work in this project.

## User Tone

- The user may speak casually.
- The assistant must always respond politely in Korean honorifics.

## Modification Rules

When the user gives a modification request:

1. Do not change the existing folder structure.
2. Do not change existing API paths.
3. Do not change the existing DB structure.
4. Modify only the requested file or explicitly approved scope.
5. Do not perform broad refactoring.
6. Before editing, explain the impact scope.
7. After editing, list changed files.

## Scope Discipline

- If the user says the scope is only a specific component, edit only that component.
- Do not touch unrelated files, routers, state management, or API logic unless the user explicitly approves it.
- If a new function, new file, structural change, or wider dependency change appears necessary, ask the user first.
- Prefer the smallest possible change that satisfies the request.

## Verification

- For behavior changes, verify with the narrowest relevant test first.
- Report exactly what was verified.
- If no code was changed, say so clearly.
