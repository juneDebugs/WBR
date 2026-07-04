-- Step 1: Assign existing unassigned sessions to matching speakers

-- AI & Machine Learning sessions -> AI & Data speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yo0005h91b8narwco2' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yr000bh91bwuh2hj2n' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yz000zh91b6kle4hxm' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z10017h91bsogldf82' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z6001lh91b9emsxigd' AND speakerId IS NULL;

-- Data & Analytics -> AI & Data speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yq0009h91b4jhq9u1v' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yv000ph91bzjs4eat2' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='AI & Data' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yx000vh91blrcqitl0' AND speakerId IS NULL;

-- Marketing -> Marketing & Growth speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg3us00003t4n0ljqh8sbi' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yt000hh91bg22iaqnw' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yu000lh91brhwicofs' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yy000xh91bcxnc435f' AND speakerId IS NULL;

-- Retention & Subscriptions -> Marketing & Growth speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg3urz0001t4n0g8smxi6a' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zme000951i7twrmtzuj' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z3001bh91bi1l8mco7' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Marketing & Growth' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z3001dh91b7a5s0lim' AND speakerId IS NULL;

-- Customer Experience -> Brand & Experience speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Brand & Experience' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg3us20007t4n0jg0oqkfv' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Brand & Experience' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg3us30009t4n05kgxv0xu' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Brand & Experience' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zm8000151i7ehyoyds8' AND speakerId IS NULL;

-- Payments & Checkout -> Payments & Checkout speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Payments & Checkout' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yp0007h91bjas86199' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Payments & Checkout' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yr000dh91bvfq2dbjz' AND speakerId IS NULL;

-- International & Marketplace -> Payments & Checkout speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Payments & Checkout' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zmh000f51i7sypldbt2' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Payments & Checkout' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z20019h91b274w032a' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Payments & Checkout' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z5001jh91bzeie8boj' AND speakerId IS NULL;

-- Operations & Fulfillment -> Logistics & Fulfillment speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Logistics & Fulfillment' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yt000jh91bns5yghnw' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Logistics & Fulfillment' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zmg000d51i7e49kjjt8' AND speakerId IS NULL;

-- Technology -> Commerce & Platforms speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Commerce & Platforms' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yn0003h91borezl2iz' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Commerce & Platforms' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270ys000fh91bywugpunr' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Commerce & Platforms' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yv000nh91be8levbsk' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Commerce & Platforms' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yx000th91be3tuutn5' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Commerce & Platforms' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z4001fh91b6vhbs383' AND speakerId IS NULL;

-- Technology -> Security & Infrastructure speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Security & Infrastructure' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270z4001hh91bzjut9go0' AND speakerId IS NULL;

-- Enterprise & B2B -> ERP speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='ERP' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh270yl0001h91bl4e9zl10' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='ERP' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmnh27dbm0001db2gxhbkrc1m' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='ERP' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zmd000751i717stvy4u' AND speakerId IS NULL;

-- Commerce -> Commerce & Platforms speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Commerce & Platforms' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'ses-1' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Commerce & Platforms' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zmi000h51i77uzfxr3e' AND speakerId IS NULL;

-- Social events -> Brand & Experience speakers
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Brand & Experience' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zma000351i7nzt65y7o' AND speakerId IS NULL;
UPDATE ConfSession SET speakerId = (SELECT s.id FROM Speaker s WHERE s.conferenceId='conf-2025' AND s.role='Brand & Experience' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1) WHERE id = 'cmngg5zmj000j51i7x7crbczl' AND speakerId IS NULL;
