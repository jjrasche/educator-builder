import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [key, ...valueParts] = line.split('=');
  process.env[key.trim()] = valueParts.join('=').replace(/^["']|["']$/g, '');
}

console.log('✓ Environment loaded');

// Now import and run the personas script
import('./testing/run-personas.mjs');
