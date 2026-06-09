import { createClient } from '@clickhouse/client'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Pricing: [inputPricePer1M, outputPricePer1M]
// ---------------------------------------------------------------------------
const MODELS: Array<{
  provider: string
  model: string
  inputPrice: number
  outputPrice: number
}> = [
  { provider: 'openai',    model: 'gpt-4o',              inputPrice: 2.50,  outputPrice: 10.00 },
  { provider: 'openai',    model: 'gpt-4o-mini',         inputPrice: 0.15,  outputPrice: 0.60  },
  { provider: 'anthropic', model: 'claude-3-5-sonnet',   inputPrice: 3.00,  outputPrice: 15.00 },
  { provider: 'anthropic', model: 'claude-3-5-haiku',    inputPrice: 1.00,  outputPrice: 5.00  },
]

const ORG_ID    = 'org_test_01'
const DAYS      = 30
const BATCH_SIZE = 100

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ---------------------------------------------------------------------------
// Build all rows up-front
// ---------------------------------------------------------------------------
interface CostEvent {
  request_id:    string
  org_id:        string
  provider:      string
  model:         string
  input_tokens:  number
  output_tokens: number
  cost_usd:      number
  timestamp_ms:  number
  duration_ms:   number
}

function buildRows(): CostEvent[] {
  const rows: CostEvent[] = []
  const now = Date.now()

  for (let d = 0; d < DAYS; d++) {
    // Start of day (UTC midnight) for "today - d days"
    const dayStart = now - d * 86_400_000
    const dayStartMidnight = dayStart - (dayStart % 86_400_000)

    for (const { provider, model, inputPrice, outputPrice } of MODELS) {
      const requestsToday = randInt(5, 25)

      for (let r = 0; r < requestsToday; r++) {
        const input_tokens  = randInt(200, 2000)
        const output_tokens = randInt(50, 800)
        const cost_usd =
          (input_tokens  / 1_000_000) * inputPrice +
          (output_tokens / 1_000_000) * outputPrice

        rows.push({
          request_id:    randomUUID(),
          org_id:        ORG_ID,
          provider,
          model,
          input_tokens,
          output_tokens,
          cost_usd:      Math.round(cost_usd * 1_000_000) / 1_000_000,
          timestamp_ms:  dayStartMidnight + randInt(0, 86_399_999),
          duration_ms:   randInt(500, 8000),
        })
      }
    }
  }

  return rows
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const client = createClient({
    url:      process.env.CLICKHOUSE_HOST ?? 'http://localhost:8123',
    username: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
    database: process.env.CLICKHOUSE_DB ?? 'default',
  })

  const rows = buildRows()
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE)

  console.log(`Total rows to insert: ${rows.length} across ${totalBatches} batches`)

  for (let b = 0; b < totalBatches; b++) {
    const batch = rows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
    console.log(`Inserting batch ${b + 1}/${totalBatches}...`)

    await client.insert({
      table:  'cost_events',
      values: batch,
      format: 'JSONEachRow',
    })
  }

  await client.close()
  console.log(`Done. Inserted ${rows.length} rows.`)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
