#!/bin/bash
# Assign sessions to all speakers who don't have one

DB="packages/db/prisma/dev.db"
CONF_ID="conf-2025"

# Role-to-track mapping
declare -A ROLE_TRACKS
ROLE_TRACKS["AI & Data"]="AI & Machine Learning"
ROLE_TRACKS["Commerce & Platforms"]="Technology"
ROLE_TRACKS["Marketing & Growth"]="Marketing"
ROLE_TRACKS["Logistics & Fulfillment"]="Operations & Fulfillment"
ROLE_TRACKS["Payments & Checkout"]="Payments & Checkout"
ROLE_TRACKS["Brand & Experience"]="Customer Experience"
ROLE_TRACKS["Security & Infrastructure"]="Technology"
ROLE_TRACKS["ERP"]="Enterprise & B2B"

echo "=== Step 1: Assign existing unassigned sessions to speakers ==="

# Get unassigned non-break sessions
UNASSIGNED=$(sqlite3 "$DB" "SELECT id, track FROM ConfSession WHERE conferenceId='$CONF_ID' AND speakerId IS NULL AND type NOT IN ('BREAK') ORDER BY startsAt;")

while IFS='|' read -r ses_id ses_track; do
  [ -z "$ses_id" ] && continue

  # Find a speaker whose role maps to this track and doesn't have a session yet
  for role in "${!ROLE_TRACKS[@]}"; do
    mapped_track="${ROLE_TRACKS[$role]}"
    if [ "$mapped_track" = "$ses_track" ] || echo "$ses_track" | grep -qi "$(echo "$role" | cut -d'&' -f1 | xargs)"; then
      # Find speaker with this role who has no sessions
      spk_id=$(sqlite3 "$DB" "SELECT s.id FROM Speaker s WHERE s.conferenceId='$CONF_ID' AND s.role='$role' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) LIMIT 1;")
      if [ -n "$spk_id" ]; then
        sqlite3 "$DB" "UPDATE ConfSession SET speakerId='$spk_id' WHERE id='$ses_id';"
        spk_name=$(sqlite3 "$DB" "SELECT name FROM Speaker WHERE id='$spk_id';")
        ses_title=$(sqlite3 "$DB" "SELECT title FROM ConfSession WHERE id='$ses_id';")
        echo "  Assigned: '$ses_title' -> $spk_name"
        break
      fi
    fi
  done
done <<< "$UNASSIGNED"

echo ""
echo "=== Step 2: Create sessions for remaining speakers ==="

# Get speakers still without sessions
REMAINING=$(sqlite3 "$DB" "SELECT s.id, s.name, s.role, s.bio FROM Speaker s WHERE s.conferenceId='$CONF_ID' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL) ORDER BY s.name;")

# Time slots for sessions (Unix ms)
STARTS=(1807116300000 1807118100000 1807120800000 1807128000000 1807131600000 1807134300000 1807137000000 1807202700000 1807204500000 1807207200000 1807214400000 1807217100000 1807220700000 1807223400000)
ENDS=(1807119000000 1807120800000 1807123500000 1807130700000 1807134300000 1807137000000 1807139700000 1807205400000 1807207200000 1807209900000 1807217100000 1807219800000 1807223400000 1807226100000)
ROOMS=("Main Stage" "Hall A" "Hall B" "Workshop Room A" "Workshop Room B" "Room C")

slot_idx=0
count=0

while IFS='|' read -r spk_id spk_name spk_role spk_bio; do
  [ -z "$spk_id" ] && continue

  track="${ROLE_TRACKS[$spk_role]:-Technology}"

  # Generate a session title based on role and bio
  case "$spk_role" in
    "AI & Data")
      titles=("AI-Powered Commerce: From Data to Decisions" "Building Intelligent Product Discovery Systems" "Machine Learning for Personalized Shopping Experiences" "Real-Time Analytics for Commerce Optimization" "Voice Commerce & Conversational AI" "Predictive Customer Analytics for Retention" "Computer Vision in Retail & Visual Search" "NLP-Driven Customer Insights at Scale")
      tracks=("AI & Machine Learning" "AI & Machine Learning" "Data & Analytics" "Data & Analytics" "AI & Machine Learning" "Data & Analytics" "AI & Machine Learning" "Data & Analytics")
      types=("TALK" "WORKSHOP" "TALK" "TALK" "TALK" "WORKSHOP" "TALK" "TALK")
      ;;
    "Commerce & Platforms")
      titles=("Composable Commerce: Architecting for Flexibility" "Headless Storefronts: Performance & Developer Experience" "API-First Commerce: Building Blocks for Modern Retail" "Progressive Web Apps for Commerce" "Multi-Tenant Marketplace Architecture" "Platform Migration: A Practical Playbook" "Accessibility in Commerce: Inclusive Shopping" "Commerce API Design Patterns That Scale")
      tracks=("Technology" "Technology" "Technology" "Technology" "Enterprise & B2B" "Technology" "Technology" "Technology")
      types=("TALK" "TALK" "WORKSHOP" "TALK" "TALK" "TALK" "WORKSHOP" "TALK")
      ;;
    "Marketing & Growth")
      titles=("SMS Marketing at Scale: Automation That Converts" "Influencer Commerce: From Awareness to Revenue" "Lifecycle Email Campaigns That Drive 30%+ Revenue" "CRO Deep Dive: A/B Testing for Ecommerce" "Retail Media Networks: First-Party Data Strategy" "Building Loyalty Programs That Actually Work" "Attribution Modeling in a Post-Cookie World" "Content-Led Growth for DTC Brands")
      tracks=("Marketing" "Marketing" "Marketing" "Retention & Subscriptions" "Marketing" "Retention & Subscriptions" "Data & Analytics" "Marketing")
      types=("TALK" "TALK" "WORKSHOP" "TALK" "TALK" "TALK" "WORKSHOP" "TALK")
      ;;
    "Logistics & Fulfillment")
      titles=("Warehouse Robotics: Automating Pick, Pack & Ship" "Last-Mile Delivery: Speed vs. Cost Optimization" "Returns Management: Turning Costs into Revenue" "Global Fulfillment Networks at Scale" "Real-Time Shipment Visibility for Customers" "Omnichannel Fulfillment: BOPIS & Ship-from-Store" "3PL Selection & Optimization Strategies" "Sustainable Shipping & Carbon-Neutral Logistics")
      tracks=("Operations & Fulfillment" "Operations & Fulfillment" "Customer Experience" "Operations & Fulfillment" "Customer Experience" "Operations & Fulfillment" "Operations & Fulfillment" "Operations & Fulfillment")
      types=("TALK" "TALK" "TALK" "WORKSHOP" "TALK" "TALK" "WORKSHOP" "TALK")
      ;;
    "Payments & Checkout")
      titles=("One-Click Checkout: Reducing Friction to Zero" "Subscription Billing for Resilient Recurring Revenue" "Cross-Border Payments: Global Commerce Simplified" "Fraud Detection Without Customer Friction" "Buy Now Pay Later: Impact on Conversion & AOV" "Checkout Optimization: Recovering Abandoned Revenue" "Payment Orchestration for Global Brands" "Mobile Payments & The Tap Economy")
      tracks=("Payments & Checkout" "Payments & Checkout" "International & Marketplace" "Payments & Checkout" "Payments & Checkout" "Payments & Checkout" "Payments & Checkout" "International & Marketplace")
      types=("TALK" "TALK" "TALK" "WORKSHOP" "TALK" "TALK" "WORKSHOP" "TALK")
      ;;
    "Brand & Experience")
      titles=("Building Brand Communities That Drive Growth" "Unboxing as Marketing: Viral Packaging Design" "UGC & Reviews: Social Proof at Scale" "AR/VR Commerce: Immersive Shopping Experiences" "Luxury Ecommerce: High-Touch Goes Digital" "DTC Brand Storytelling That Converts" "Customer Experience: Browse to Post-Purchase" "Social Proof Optimization: Beyond Star Ratings")
      tracks=("Customer Experience" "Customer Experience" "Retention & Subscriptions" "Customer Experience" "Customer Experience" "Marketing" "Customer Experience" "Retention & Subscriptions")
      types=("TALK" "TALK" "TALK" "WORKSHOP" "TALK" "TALK" "WORKSHOP" "TALK")
      ;;
    "Security & Infrastructure")
      titles=("Zero Trust for Commerce: Securing Customer Data" "Performance Engineering: Sub-Second Page Loads" "Bot Protection for Ecommerce Platforms" "Edge Computing for Global Commerce" "Sustainable Digital Infrastructure for Retail" "Social Commerce Security Best Practices" "Data Privacy & Compliance in Cross-Border Commerce" "Incident Response: Minimizing Downtime Impact")
      tracks=("Security" "Technology" "Security" "Technology" "Technology" "Technology" "Security" "Technology")
      types=("TALK" "TALK" "WORKSHOP" "TALK" "TALK" "TALK" "TALK" "WORKSHOP")
      ;;
    "ERP")
      titles=("Modern ERP: Connecting Commerce to Back-Office" "Demand Forecasting & Inventory Planning" "PIM for Multi-Channel Product Consistency" "B2B Commerce: From Catalogs to Self-Service" "Retail Analytics Dashboards for Merchants" "Localization: Language, Currency & Culture" "Cross-Border Duties, Taxes & Regulations" "Composable ERP: Breaking the Monolith")
      tracks=("Enterprise & B2B" "Data & Analytics" "Enterprise & B2B" "Enterprise & B2B" "Data & Analytics" "International & Marketplace" "International & Marketplace" "Enterprise & B2B")
      types=("TALK" "TALK" "TALK" "WORKSHOP" "TALK" "TALK" "WORKSHOP" "TALK")
      ;;
    *)
      titles=("Commerce Innovation: Trends & Opportunities")
      tracks=("Technology")
      types=("TALK")
      ;;
  esac

  idx=$((count % ${#titles[@]}))
  title="${titles[$idx]}"
  ses_track="${tracks[$idx]}"
  ses_type="${types[$idx]}"

  s_idx=$((slot_idx % ${#STARTS[@]}))
  start="${STARTS[$s_idx]}"
  end="${ENDS[$s_idx]}"
  room="${ROOMS[$((slot_idx % ${#ROOMS[@]}))]}"

  # Create description
  desc="Join ${spk_name} for an in-depth session on ${title,,}. ${spk_bio}"
  # Escape single quotes for SQL
  title_esc="${title//\'/\'\'}"
  desc_esc="${desc//\'/\'\'}"
  ses_track_esc="${ses_track//\'/\'\'}"

  ses_id="ses-gen-${count}"

  sqlite3 "$DB" "INSERT INTO ConfSession (id, conferenceId, title, description, speakerId, room, startsAt, endsAt, track, type, createdAt) VALUES ('$ses_id', '$CONF_ID', '$title_esc', '$desc_esc', '$spk_id', '$room', $start, $end, '$ses_track_esc', '$ses_type', datetime('now'));"

  echo "  Created: '$title' for $spk_name ($spk_role) @ $room"

  slot_idx=$((slot_idx + 1))
  count=$((count + 1))
done <<< "$REMAINING"

echo ""
echo "=== Verification ==="
remaining=$(sqlite3 "$DB" "SELECT COUNT(*) FROM Speaker s WHERE s.conferenceId='$CONF_ID' AND s.id NOT IN (SELECT DISTINCT speakerId FROM ConfSession WHERE speakerId IS NOT NULL);")
echo "Speakers still without sessions: $remaining"

total=$(sqlite3 "$DB" "SELECT COUNT(*) FROM Speaker WHERE conferenceId='$CONF_ID';"  )
with_sessions=$(sqlite3 "$DB" "SELECT COUNT(DISTINCT speakerId) FROM ConfSession WHERE speakerId IS NOT NULL;")
echo "Total speakers: $total, With sessions: $with_sessions"

# Copy DB to all app directories
echo ""
echo "=== Copying DB to app directories ==="
cp "$DB" apps/attendee/dev.db
cp "$DB" apps/web/dev.db
cp "$DB" apps/sponsor/dev.db
cp "$DB" apps/meetings/dev.db
echo "Done!"
