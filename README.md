# CodeQuest — Vanilla JS Levels

This is a lightweight, vanilla-JS coding game designed for students. It runs locally and uses an iframe sandbox to execute user code and evaluate level tests.

Quick start

1. Open a terminal in the project folder:

```bash
cd /Users/tomoffringa/Desktop/Code\ sandbox/multiple\ level\ game\ uso
```

2. Start a simple static server (recommended) and open `http://localhost:8000`:

```bash
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

How it works

- Levels are defined in `levels.json`. Each level has `starterCode` and a `testCode` string that is executed inside the iframe to determine success.
- The iframe harness captures `console.log` into `consoleMessages`, runs user code, then runs `testCode` and posts the result back to the parent.
- The app awards points, unlocks badges, and persists progress to `localStorage`.

Extending

- To add levels, edit `levels.json`. Keep tests simple and safe; they run in the same-origin iframe but are sandboxed by `sandbox="allow-scripts"`.
- If you want a richer editor, later you can swap the `<textarea>` for a client-side editor like CodeMirror or Monaco.

Security notes

- This is intended for educational, local use. The iframe uses `sandbox` but if you expose this on the web, review additional security measures.
