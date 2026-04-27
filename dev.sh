#!/bin/bash
# Clean all .next caches and restart all dev servers
# Usage: ./dev.sh          — start all 4 apps
#        ./dev.sh web      — start only admin (port 3000)
#        ./dev.sh attendee — start only mobile app (port 3001)
#        ./dev.sh meetings — start only meeting portal (port 3002)
#        ./dev.sh sponsor  — start only sponsor portal (port 3003)

APP=${1:-all}

if [ "$APP" = "all" ] || [ "$APP" = "web" ]; then
  kill -9 $(lsof -ti:3000) 2>/dev/null
  rm -rf apps/web/.next
fi
if [ "$APP" = "all" ] || [ "$APP" = "attendee" ]; then
  kill -9 $(lsof -ti:3001) 2>/dev/null
  rm -rf apps/attendee/.next
fi
if [ "$APP" = "all" ] || [ "$APP" = "meetings" ]; then
  kill -9 $(lsof -ti:3002) 2>/dev/null
  rm -rf apps/meetings/.next
fi
if [ "$APP" = "all" ] || [ "$APP" = "sponsor" ]; then
  kill -9 $(lsof -ti:3003) 2>/dev/null
  rm -rf apps/sponsor/.next
fi

sleep 1

if [ "$APP" = "all" ] || [ "$APP" = "web" ]; then
  npx pnpm --filter web dev &
fi
if [ "$APP" = "all" ] || [ "$APP" = "attendee" ]; then
  npx pnpm --filter attendee dev &
fi
if [ "$APP" = "all" ] || [ "$APP" = "meetings" ]; then
  npx pnpm --filter meetings dev &
fi
if [ "$APP" = "all" ] || [ "$APP" = "sponsor" ]; then
  npx pnpm --filter sponsor dev &
fi

sleep 8
echo ""
echo "Servers running:"
[ "$APP" = "all" ] || [ "$APP" = "web" ] && echo "  Admin:          http://localhost:3000"
[ "$APP" = "all" ] || [ "$APP" = "attendee" ] && echo "  Mobile App:     http://localhost:3001"
[ "$APP" = "all" ] || [ "$APP" = "meetings" ] && echo "  Meeting Portal: http://localhost:3002"
[ "$APP" = "all" ] || [ "$APP" = "sponsor" ] && echo "  Sponsor Portal: http://localhost:3003"
echo ""
echo "Hard refresh browser (Cmd+Shift+R) after restart."
