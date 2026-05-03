import fs from 'fs'
import path from 'path'
import https from 'https'

const API_KEY = process.env.OPENAI_API_KEY
const OUT_DIR = path.resolve('/Users/june/WBR/apps/attendee/public/speakers')

// All 46 speakers that failed the professional headshot review
const speakers = [
  // ERP failures
  { id: 'spk-30', name: 'Patrick O\'Sullivan', prompt: 'Professional LinkedIn headshot portrait of a friendly Irish man in his late 30s with light skin, short brown hair, warm confident smile, wearing a navy blazer over a white dress shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-46', name: 'Michael Chang', prompt: 'Professional LinkedIn headshot portrait of a friendly East Asian man in his mid-30s, warm natural smile, wearing a dark charcoal suit jacket with light blue shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-70', name: 'Ben Gallagher', prompt: 'Professional LinkedIn headshot portrait of a friendly young Caucasian man in his late 20s, light brown hair, warm natural smile, wearing a fitted navy blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },

  // Commerce & Platforms failures
  { id: 'spk-5', name: 'Elena Rodriguez', prompt: 'Professional LinkedIn headshot portrait of a confident Latina woman in her early 40s, dark hair, warm professional smile, wearing a tailored dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-25', name: 'Alex Nguyen', prompt: 'Professional LinkedIn headshot portrait of a friendly Vietnamese American man in his early 30s, short dark hair, warm smile, wearing a smart casual dark polo shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-32', name: 'Nathan Brooks', prompt: 'Professional LinkedIn headshot portrait of a friendly Caucasian man in his mid-30s, curly light brown hair, warm natural smile, wearing a smart casual button-down shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-40', name: 'Chris Bennett', prompt: 'Professional LinkedIn headshot portrait of a friendly Caucasian man in his late 40s, salt-and-pepper hair, warm approachable smile, wearing a dark blazer with open collar shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-58', name: 'Brian Foster', prompt: 'Professional LinkedIn headshot portrait of a friendly Caucasian man in his mid-30s, dark hair, glasses, warm natural smile, wearing a smart casual dark sweater, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-68', name: 'Adrian Pope', prompt: 'Professional LinkedIn headshot portrait of a confident Eastern European man in his mid-30s, short light hair, warm professional smile, wearing a dark turtleneck sweater, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-48', name: 'Finn O\'Connor', prompt: 'Professional LinkedIn headshot portrait of a friendly Irish man in his late 20s, dark hair, warm genuine smile, wearing a casual blazer over a crew neck, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },

  // Marketing & Growth failures
  { id: 'spk-9', name: 'Mei Lin Zhang', prompt: 'Professional LinkedIn headshot portrait of a friendly East Asian woman in her early 30s, long dark hair, warm bright smile, wearing a white professional blouse, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-23', name: 'Marco Rossi', prompt: 'Professional LinkedIn headshot portrait of a friendly Italian man in his mid-30s, dark hair, short beard, warm approachable smile, wearing a smart dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-45', name: 'Lena Fischer', prompt: 'Professional LinkedIn headshot portrait of a friendly German woman in her early 30s, short curly brown hair, glasses, warm natural smile, wearing a professional navy blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-47', name: 'Aaliyah Davis', prompt: 'Professional LinkedIn headshot portrait of a confident Black woman in her late 20s, natural hair, warm bright smile, wearing a stylish dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-60', name: 'Sean Murphy', prompt: 'Professional LinkedIn headshot portrait of a friendly Irish man in his mid-30s, dark hair, warm confident smile, wearing a smart navy suit jacket, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },

  // Logistics & Fulfillment failures
  { id: 'spk-7', name: 'Amira Hassan', prompt: 'Professional LinkedIn headshot portrait of a friendly Middle Eastern woman in her mid-30s, dark hair, warm natural smile, wearing a professional blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-8', name: 'Ryan Cooper', prompt: 'Professional LinkedIn headshot portrait of a friendly Caucasian man in his early 30s, light brown hair, warm genuine smile, wearing a smart casual button-down shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-15', name: 'Sophie Dubois', prompt: 'Professional LinkedIn headshot portrait of a friendly French woman in her early 30s, light brown hair, warm natural smile, wearing a chic dark blouse, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-16', name: 'Kenji Tanaka', prompt: 'Professional LinkedIn headshot portrait of a friendly Japanese man in his late 30s, short dark hair, warm natural smile, wearing a dark blazer with white shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-20', name: 'Nadia Petrova', prompt: 'Professional LinkedIn headshot portrait of a friendly Eastern European woman in her early 30s, dark hair, warm bright smile, wearing a professional blouse, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-36', name: 'Andre Williams', prompt: 'Professional LinkedIn headshot portrait of a confident Black man in his mid-30s, short hair, glasses, warm professional smile, wearing a fitted dark blazer with white shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-49', name: 'Priyanka Sharma', prompt: 'Professional LinkedIn headshot portrait of a friendly South Asian woman in her early 30s, long dark hair, warm natural smile, wearing a professional blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-66', name: 'Omar Bakari', prompt: 'Professional LinkedIn headshot portrait of a friendly East African man in his mid-30s, short dark hair, warm genuine smile, wearing a smart dark blazer with open collar, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-71', name: 'Chiara Bianchi', prompt: 'Professional LinkedIn headshot portrait of a friendly Italian woman in her early 30s, dark hair, warm bright smile, wearing an elegant dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },

  // AI & Data failures
  { id: 'spk-2', name: 'Marcus Williams', prompt: 'Professional LinkedIn headshot portrait of a confident Black man in his early 40s, short hair, warm strong smile, wearing a fitted dark suit jacket, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-17', name: 'Ava Mitchell', prompt: 'Professional LinkedIn headshot portrait of a friendly Caucasian woman in her mid-30s, brown hair, warm natural smile, wearing a professional dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-18', name: 'Ibrahim Koné', prompt: 'Professional LinkedIn headshot portrait of a friendly West African man in his late 30s, warm genuine smile, wearing a smart dark blazer with light shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-59', name: 'Ananya Gupta', prompt: 'Professional LinkedIn headshot portrait of a friendly South Asian woman in her late 20s, dark hair, warm bright smile, wearing a professional light blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-69', name: 'Samira Youssef', prompt: 'Professional LinkedIn headshot portrait of a friendly Middle Eastern woman in her early 30s, dark hair, warm natural smile, wearing a professional dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },

  // Payments & Checkout failures
  { id: 'spk-11', name: 'Fatima Al-Rashid', prompt: 'Professional LinkedIn headshot portrait of a friendly Middle Eastern woman in her mid-30s, dark hair, warm confident smile, wearing a professional blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-19', name: 'Rachel Kim', prompt: 'Professional LinkedIn headshot portrait of a friendly Korean American woman in her late 20s, dark hair, warm bright smile, wearing a professional white blouse, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-57', name: 'Tamara Novak', prompt: 'Professional LinkedIn headshot portrait of a friendly Eastern European woman in her early 30s, short curly hair, warm natural smile, wearing a dark professional blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-63', name: 'Ling Wei', prompt: 'Professional LinkedIn headshot portrait of a friendly East Asian woman in her mid-30s, dark hair, warm professional smile, wearing a chic dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-38', name: 'Oscar Hernandez', prompt: 'Professional LinkedIn headshot portrait of a friendly Latino man in his early 30s, dark hair, warm approachable smile, wearing a smart blazer with open collar, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },

  // Brand & Experience failures
  { id: 'spk-10', name: 'Carlos Mendoza', prompt: 'Professional LinkedIn headshot portrait of a friendly Latino man in his mid-40s, dark hair, warm confident smile, wearing a navy blazer with white shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-21', name: 'Lucas Wright', prompt: 'Professional LinkedIn headshot portrait of a friendly Caucasian man in his early 30s, dark hair, beard, warm smile, wearing a smart casual dark shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-29', name: 'Grace Obi', prompt: 'Professional LinkedIn headshot portrait of a friendly Black woman in her late 20s, natural hair, warm bright smile, wearing a professional white blouse, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-31', name: 'Leila Ahmadi', prompt: 'Professional LinkedIn headshot portrait of a friendly Persian woman in her early 30s, dark hair, warm natural smile, wearing a stylish dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-51', name: 'Esme Delacroix', prompt: 'Professional LinkedIn headshot portrait of a friendly French woman in her mid-30s, dark hair, warm professional smile, wearing an elegant dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },

  // Security & Infrastructure failures
  { id: 'spk-1', name: 'Sarah Chen', prompt: 'Professional LinkedIn headshot portrait of a friendly East Asian woman in her mid-30s, short bob haircut, warm confident smile, wearing a professional white blouse, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-4', name: 'James Okafor', prompt: 'Professional LinkedIn headshot portrait of a friendly West African man in his mid-40s, warm authoritative smile, wearing a crisp dark blazer with white shirt, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-24', name: 'Diana Okonkwo', prompt: 'Professional LinkedIn headshot portrait of a friendly Nigerian woman in her mid-30s, warm professional smile, wearing a professional blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-50', name: 'Jordan Taylor', prompt: 'Professional LinkedIn headshot portrait of a friendly Caucasian woman in her early 30s, dark hair, warm natural smile, wearing a professional dark top, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-65', name: 'Victoria Strand', prompt: 'Professional LinkedIn headshot portrait of a friendly Latina woman in her late 20s, dark hair, warm bright smile, wearing a professional blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-72', name: 'Derek Huang', prompt: 'Professional LinkedIn headshot portrait of a friendly East Asian man in his mid-30s, short dark hair, warm genuine smile, wearing a smart dark blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
  { id: 'spk-35', name: 'Emma Johansson', prompt: 'Professional LinkedIn headshot portrait of a friendly Scandinavian woman in her early 30s, light brown hair, warm bright smile, wearing a professional light blazer, soft studio lighting, clean neutral background, shallow depth of field, photorealistic 4K portrait photography, eyes looking directly at camera' },
]

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, res => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', err => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function generate(speaker) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: speaker.prompt,
      n: 1,
      size: '1024x1792',
      quality: 'hd',
      style: 'natural',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API error for ${speaker.id} (${speaker.name}): ${err}`)
  }

  const data = await res.json()
  const imageUrl = data.data[0].url
  const dest = path.join(OUT_DIR, `${speaker.id}.jpg`)
  await download(imageUrl, dest)
  console.log(`✓ ${speaker.id} (${speaker.name}) — saved to ${dest}`)
  return `/speakers/${speaker.id}.jpg`
}

async function main() {
  console.log(`\nGenerating ${speakers.length} replacement speaker images...\n`)

  if (!API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is not set')
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const results = []
  for (let i = 0; i < speakers.length; i++) {
    const speaker = speakers[i]
    try {
      console.log(`[${i + 1}/${speakers.length}] Generating ${speaker.name}...`)
      const localPath = await generate(speaker)
      results.push({ id: speaker.id, name: speaker.name, localPath })
      // Small delay to stay within rate limits
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) {
      console.error(`✗ ${speaker.id} (${speaker.name}):`, e.message)
      results.push({ id: speaker.id, name: speaker.name, error: e.message })
    }
  }

  console.log('\n=== Summary ===')
  const successes = results.filter(r => !r.error)
  const failures = results.filter(r => r.error)
  console.log(`✓ ${successes.length} succeeded`)
  if (failures.length > 0) {
    console.log(`✗ ${failures.length} failed:`)
    failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`))
  }

  console.log('\nDone! Now update seed.ts photoUrl fields to use local paths.')
}

main()
