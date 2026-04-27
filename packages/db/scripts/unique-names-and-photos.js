// Assigns every ATTENDEE/SPEAKER a unique full name and a profile photo.
// Uses i.pravatar.cc for avatars (deterministic by user id hash).

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

// 200 first names (100 traditionally male, 100 traditionally female)
const FIRST_NAMES = [
  'James','John','Robert','Michael','David','William','Richard','Joseph','Thomas','Christopher',
  'Charles','Daniel','Matthew','Anthony','Mark','Donald','Steven','Andrew','Paul','Joshua',
  'Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan',
  'Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon',
  'Benjamin','Samuel','Raymond','Gregory','Frank','Alexander','Patrick','Jack','Dennis','Jerry',
  'Tyler','Aaron','Nathan','Henry','Peter','Adam','Douglas','Zachary','Walter','Harold',
  'Kyle','Carl','Arthur','Gerald','Roger','Lawrence','Jesse','Dylan','Bryan','Joe',
  'Jordan','Billy','Bruce','Albert','Willie','Gabriel','Logan','Alan','Juan','Wayne',
  'Elijah','Randy','Roy','Vincent','Ralph','Eugene','Russell','Bobby','Mason','Philip',
  'Louis','Harry','Christian','Derek','Ethan','Liam','Noah','Owen','Caleb','Isaac',
  'Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen',
  'Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Dorothy','Kimberly','Emily','Donna',
  'Michelle','Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura','Cynthia',
  'Kathleen','Amy','Angela','Shirley','Anna','Brenda','Pamela','Emma','Nicole','Helen',
  'Samantha','Katherine','Christine','Debra','Rachel','Carolyn','Janet','Catherine','Maria','Heather',
  'Diane','Ruth','Julie','Olivia','Joyce','Virginia','Victoria','Kelly','Lauren','Christina',
  'Joan','Evelyn','Judith','Megan','Andrea','Cheryl','Hannah','Jacqueline','Martha','Gloria',
  'Teresa','Ann','Sara','Madison','Frances','Kathryn','Janice','Jean','Abigail','Alice',
  'Judy','Sophia','Grace','Denise','Amber','Doris','Marilyn','Danielle','Beverly','Isabella',
  'Theresa','Diana','Natalie','Brittany','Charlotte','Marie','Kayla','Alexis','Lori','Natasha',
]

// 300 last names
const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
  'Gomez','Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes',
  'Stewart','Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper',
  'Peterson','Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson',
  'Watson','Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza','Ruiz','Hughes',
  'Price','Alvarez','Castillo','Sanders','Patel','Myers','Long','Ross','Foster','Jimenez',
  'Powell','Jenkins','Perry','Russell','Sullivan','Bell','Coleman','Butler','Henderson','Barnes',
  'Gonzales','Fisher','Vasquez','Simmons','Griffin','Aguilar','Morton','Schmidt','Larson','Olson',
  'Burke','Watts','Dixon','Hunt','Weaver','Stanley','Hart','Hicks','Hudson','Gibson',
  'Ellis','Mcdonald','Cruz','Marshall','Owens','Harrison','Fernandez','Daniels','Spencer','Grant',
  'Stone','Stephens','Payne','Fuller','Soto','Medina','Garza','Shaw','Wagner','Palmer',
  'Fox','Graham','Burke','Robertson','Hale','Walsh','Dunn','Burns','Gordon','Harper',
  'Murray','Freeman','Wells','Webb','Simpson','Stevens','Tucker','Porter','Hunter','Hicks',
  'Crawford','Boyd','Mason','Moreno','Kennedy','Warren','Dixon','Ramos','Reeves','Burns',
  'Gordon','Palmer','Hansen','Kelley','Meyer','Carroll','Jacobs','Garrett','Duncan','Lane',
  'Lucas','Riley','Chang','Moran','Barker','Chen','Cho','Park','Singh','Sharma',
  'Das','Mishra','Khan','Ali','Hussain','Yamamoto','Tanaka','Watanabe','Sato','Nakamura',
  'Suzuki','Ito','Takahashi','Kobayashi','Shimizu','Hayashi','Morita','Fujita','Okada','Nishida',
  'Ishikawa','Ueda','Ogawa','Matsuda','Hashimoto','Kimura','Miyamoto','Aoki','Endo','Sakamoto',
  'Kato','Yoshida','Inoue','Sasaki','Yamaguchi','Otsuka','Matsumoto','Ikeda','Sugiyama','Mori',
  'Murata','Goto','Kaminski','Nowak','Kowalski','Wozniak','Mazur','Krawczyk','Jankowski','Wojcik',
  'O\'Brien','O\'Connor','McCarthy','Murphy','Doyle','Byrne','Ryan','Kelly','Walsh','Brennan',
  'Costa','Santos','Oliveira','Ferreira','Almeida','Souza','Lima','Carvalho','Ribeiro','Pereira',
  'Bauer','Hoffmann','Wagner','Muller','Fischer','Weber','Schneider','Schwartz','Kruger','Richter',
  'Jensen','Nielsen','Larsen','Sorensen','Rasmussen','Andersen','Christensen','Pedersen','Madsen','Petersen',
  'Lindqvist','Johansson','Eriksson','Larsson','Karlsson','Nilsson','Bergman','Sandberg','Lund','Holm',
]

function generateUniqueName(idx) {
  const fi = idx % FIRST_NAMES.length
  const li = Math.floor(idx / FIRST_NAMES.length) % LAST_NAMES.length
  // If we exhaust 200*300=60000 combos (way more than needed), add a suffix
  const cycle = Math.floor(idx / (FIRST_NAMES.length * LAST_NAMES.length))
  const suffix = cycle > 0 ? ` ${String.fromCharCode(65 + cycle)}` : '' // A, B, C...
  return `${FIRST_NAMES[fi]} ${LAST_NAMES[li]}${suffix}`
}

// Deterministic avatar URL from user id
function avatarUrl(id, idx) {
  // Use a mix of avatar services for variety
  // i.pravatar.cc returns random faces, seeded by number
  const seed = idx + 1 // 1-based for nicer URLs
  return `https://i.pravatar.cc/150?img=${(seed % 70) + 1}`
}

// Better approach: use randomuser.me-style or UI Avatars as fallback,
// but i.pravatar.cc only has 70 images. For 2500 users we need more variety.
// Use DiceBear API which generates unique avatars from any seed.
function avatarUrlDiceBear(id) {
  // notionists style looks like real illustrated portraits
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${id}`
}

async function main() {
  const users = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { id: true, name: true, image: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Assigning unique names and avatars to ${users.length} users...`)

  // Shuffle the name assignment to avoid alphabetical clustering
  // But keep it deterministic with a simple mapping
  const nameIndices = []
  for (let i = 0; i < users.length; i++) {
    // Spread names across the full range using a prime multiplier
    nameIndices.push((i * 137 + 43) % (FIRST_NAMES.length * LAST_NAMES.length))
  }

  // Track used names to guarantee uniqueness
  const usedNames = new Set()
  let nameIdx = 0

  for (let i = 0; i < users.length; i++) {
    let name = generateUniqueName(nameIndices[i])
    // If collision, find next available
    while (usedNames.has(name)) {
      nameIdx++
      name = generateUniqueName(nameIdx + users.length)
    }
    usedNames.add(name)

    const image = avatarUrlDiceBear(users[i].id)

    await p.user.update({
      where: { id: users[i].id },
      data: { name, image },
    })

    if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${users.length}...`)
  }

  console.log(`✓ Updated ${users.length} users with unique names and avatars`)

  // Verify no dupes
  const allNames = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { name: true },
  })
  const nameSet = new Set(allNames.map(u => u.name))
  console.log(`Unique names: ${nameSet.size} of ${allNames.length} total`)
  console.log(nameSet.size === allNames.length ? '✓ All names are unique' : '⚠️  Some duplicates remain')

  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
