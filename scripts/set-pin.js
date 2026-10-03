// Sets (or creates) a staff member's PIN, stored as a hash.
//   npm run set-pin -- "Ana"                     change Ana's PIN (asks for it, hidden)
//   npm run set-pin -- "Ana" --create management add a new person (management or staff)
// For a script, put the PIN in the NEW_PIN environment variable instead of typing it.
// A name that was locked by wrong PINs unlocks itself after 15 minutes (or on an app restart).
const readline = require('readline');
const pool = require('../src/config/database');
const { hashPin } = require('../src/shared/pin-hash');

const PIN_PATTERN = /^\d{4,10}$/;
const TIPOS = ['management', 'staff'];

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => process.stdout.write(text.includes(question) ? text : '*');
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function readPin() {
  if (process.env.NEW_PIN) return process.env.NEW_PIN;
  const first = await askHidden('Nuevo PIN (4 a 10 dígitos): ');
  const second = await askHidden('Repite el PIN: ');
  if (first !== second) throw new Error('Los PIN no coinciden.');
  return first;
}

async function main() {
  const args = process.argv.slice(2);
  const nombre = args[0];
  const createIndex = args.indexOf('--create');
  const tipo = createIndex === -1 ? null : args[createIndex + 1];
  if (!nombre || nombre.startsWith('--')) throw new Error('Uso: npm run set-pin -- "Nombre" [--create management|staff]');
  if (tipo !== null && !TIPOS.includes(tipo)) throw new Error(`--create necesita un rol: ${TIPOS.join(' o ')}.`);

  const { rows: existing } = await pool.query('SELECT id FROM staff WHERE nombre = $1', [nombre]);
  if (tipo === null && existing.length === 0) throw new Error(`No hay nadie llamado "${nombre}". Usa --create para agregarlo.`);
  if (tipo === null && existing.length > 1) throw new Error(`Hay ${existing.length} personas llamadas "${nombre}"; cambia sus nombres antes de cambiar un PIN.`);
  if (tipo !== null && existing.length > 0) throw new Error(`Ya existe "${nombre}". Quita --create para cambiar su PIN.`);

  const pin = await readPin();
  if (!PIN_PATTERN.test(pin)) throw new Error('El PIN debe tener de 4 a 10 dígitos.');
  const hash = await hashPin(pin);
  if (tipo === null) {
    await pool.query('UPDATE staff SET pin = $1 WHERE id = $2', [hash, existing[0].id]);
    console.log(`PIN de ${nombre} actualizado.`);
  } else {
    await pool.query('INSERT INTO staff (nombre, pin, tipo) VALUES ($1, $2, $3)', [nombre, hash, tipo]);
    console.log(`${nombre} agregado como ${tipo}.`);
  }
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => pool.end());
