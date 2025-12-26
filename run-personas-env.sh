#!/bin/bash
export $(cat .env.local | xargs)
node testing/run-personas.mjs > testing/persona-run-$(date +%s).log 2>&1
echo "Persona run complete. Check logs for results."
