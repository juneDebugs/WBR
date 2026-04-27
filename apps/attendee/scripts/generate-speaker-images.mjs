import fs from 'fs'
import path from 'path'
import https from 'https'

const API_KEY = process.env.OPENAI_API_KEY
const OUT_DIR = path.resolve('/Users/june/WBR/apps/attendee/public/speakers')

const speakers = [
  { id: 'spk-1',                     prompt: 'Professional headshot of Sarah Chen, East Asian woman in her mid-30s, confident smile, wearing a dark blazer, soft studio lighting, shallow depth of field, photorealistic 4K portrait photography' },
  { id: 'spk-3',                     prompt: 'Professional headshot of Priya Patel, South Asian woman in her late 30s, warm confident expression, wearing a professional blouse, clean background, soft studio lighting, photorealistic portrait photography' },
  { id: 'spk-2',                     prompt: 'Professional headshot of Marcus Williams, Black man in his early 40s, strong confident expression, wearing a fitted suit jacket, soft studio lighting, photorealistic 4K portrait' },
  { id: 'spk-4',                     prompt: 'Professional headshot of James Okafor, West African man in his mid-40s, authoritative warm smile, wearing a crisp white shirt and blazer, studio lighting, photorealistic portrait photography' },
  { id: 'cmnf4lj8y0001j63txkfh3odp', prompt: 'Professional headshot of Aisha Kamara, Black woman in her early 30s, intelligent warm expression, natural hair, wearing a chic blazer, soft bokeh background, photorealistic 4K portrait' },
  { id: 'cmnf4lj900005j63ta020c8j6',  prompt: 'Professional headshot of Leo Zhang, East Asian man in his early 30s, casual confident expression, wearing a dark tech-company quarter-zip, soft studio lighting, photorealistic portrait' },
  { id: 'cmnf4lj920009j63t6m9ssfw2',  prompt: 'Professional headshot of Nina Rossi, Italian woman in her mid-30s, sharp confident smile, wearing an elegant dark blazer, clean studio background, photorealistic 4K portrait photography' },
  { id: 'cmnf4lj92000dj63tpy1uxq40',  prompt: 'Professional headshot of Omar Hassan, Middle Eastern man in his late 30s, thoughtful expression, well-groomed beard, wearing a dark turtleneck, dramatic soft studio lighting, photorealistic portrait' },
  { id: 'cmnf4lj93000hj63tcjfb1oor',  prompt: 'Professional headshot of Yuki Tanaka, Japanese woman in her early 30s, bright warm smile, wearing a minimal chic blouse, soft gradient background, studio lighting, photorealistic 4K portrait' },
  { id: 'cmnf4lj94000lj63t2kikmyho',  prompt: 'Professional headshot of Carlos Mendez, Latino man in his mid-40s, confident broad smile, wearing a sharp navy blazer, soft studio lighting with bokeh background, photorealistic portrait' },
  { id: 'cmnf4lj95000pj63tl3ouoj40',  prompt: 'Professional headshot of Fatima Al-Amin, Middle Eastern woman in her early 30s, sharp intelligent expression, wearing a stylish blazer, soft studio lighting, photorealistic 4K portrait photography' },
  { id: 'cmnf4lj96000tj63tqrhv492w',  prompt: 'Professional headshot of Dev Patel, South Asian man in his early 30s, bright tech-founder energy, wearing a minimal crewneck, soft studio bokeh background, photorealistic portrait' },
  { id: 'cmnf4lj96000xj63twyndt17v',  prompt: 'Professional headshot of Ingrid Larsen, Scandinavian woman in her mid-40s, calm authoritative expression, light hair, wearing a tailored blazer, cool studio lighting, photorealistic 4K portrait' },
  { id: 'cmnf4lj970011j63tyh5fvwgr',  prompt: 'Professional headshot of Kwame Asante, Ghanaian man in his late 30s, approachable warm smile, wearing a patterned shirt and blazer, soft studio lighting, photorealistic portrait photography' },
  { id: 'cmnf4lj980015j63tdh1vu8xx',  prompt: 'Professional headshot of Sofia Reyes, Latina woman in her early 30s, sharp confident gaze, wearing a dark structured jacket, dramatic soft studio lighting, photorealistic 4K portrait' },
  { id: 'cmnf4lj990019j63t8g3i8761',  prompt: 'Professional headshot of Eli Cohen, Jewish man in his mid-40s, thoughtful intelligent expression, salt-and-pepper stubble, wearing a smart casual blazer, soft studio lighting, photorealistic portrait' },
  { id: 'cmnf4lj99001dj63tcq5no9rm',  prompt: 'Professional headshot of Mia Johansson, Swedish woman in her early 30s, sharp focused expression, wearing a sleek dark top, minimal studio background, cool lighting, photorealistic 4K portrait' },
  { id: 'cmnf4lj9b001hj63tj7aws4j0',  prompt: 'Professional headshot of Raj Krishnan, South Asian man in his early 30s, friendly tech-startup energy, wearing a dark hoodie and blazer, soft studio lighting, photorealistic portrait photography' },
  { id: 'cmnf4lj9b001lj63tis13j357',  prompt: 'Professional headshot of Ava Mitchell, British woman in her mid-30s, polished executive presence, wearing an elegant blazer with minimal jewelry, warm studio lighting, photorealistic 4K portrait' },
  { id: 'cmnf4lj9c001pj63t4xryz2z5',  prompt: 'Professional headshot of Tom Okonkwo, Nigerian man in his mid-30s, energetic warm smile, wearing a vibrant smart-casual shirt, soft bokeh background, studio lighting, photorealistic portrait' },
  { id: 'cmnf4lj9d001tj63twn8xy795',  prompt: 'Professional headshot of Hana Park, Korean woman in her late 20s, creative design-industry aesthetic, wearing a stylish minimalist top, clean studio background, soft lighting, photorealistic 4K portrait' },
  { id: 'cmnf4lj9e001xj63ty410ig94',  prompt: 'Professional headshot of Luca Ferrari, Italian man in his early 30s, charming confident smile, wearing a fitted open-collar shirt, warm studio lighting with soft bokeh, photorealistic portrait photography' },
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
  const res = await fetch('https://api.openai.com/v1/images/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: speaker.prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'natural',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API error for ${speaker.id}: ${err}`)
  }

  const data = await res.json()
  const imageUrl = data.data[0].url
  const dest = path.join(OUT_DIR, `${speaker.id}.jpg`)
  await download(imageUrl, dest)
  console.log(`✓ ${speaker.id} — saved`)
  return `/speakers/${speaker.id}.jpg`
}

async function main() {
  for (const speaker of speakers) {
    try {
      await generate(speaker)
      // Small delay to stay within rate limits
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      console.error(`✗ ${speaker.id}:`, e.message)
    }
  }
  console.log('\nAll done. Run update-db script next.')
}

main()
