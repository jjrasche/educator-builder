# Playwright E2E Testing

This folder contains the E2E testing infrastructure for the Educator Builder hiring funnel.

## Structure

```
playwright/
  personas/                    # Persona simulation tests
    e2e-personas.spec.js       # 4 personas (philosophical, transactional, performative, inarticulate)
    persona-test-philosophical.spec.js  # Deep single-persona test
  golden/                      # Golden case regression suite
    README.md                  # How to add golden cases
  interactive-e2e.spec.js      # Interactive Claude-as-user test
  screenshots/                 # Captured screenshots (gitignored)
  transcripts/                 # Conversation transcripts (gitignored)
```

## Running Tests

### Persona Tests (scripted flows)
```bash
npx playwright test playwright/personas/
```

### Interactive Test (Claude-driven)
```bash
npx playwright test playwright/interactive-e2e.spec.js --headed
```
This opens a browser where Claude Code can interact with the site in real-time.

### Golden Case Regression
```bash
npx playwright test playwright/golden/
```

## Outputs

- **Screenshots**: Captured at key moments for visual verification
- **Transcripts**: JSON files with full conversation + metadata for each test run

## Environment Variables

- `SITE_URL`: Target URL (default: http://localhost:3000)
