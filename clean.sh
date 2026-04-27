#!/bin/bash
# Quick cache clear — run this when you see "Cannot find module" or "reading 'call'" errors

echo "Killing dev servers..."
kill -9 $(lsof -ti:3000) 2>/dev/null
kill -9 $(lsof -ti:3001) 2>/dev/null
kill -9 $(lsof -ti:3002) 2>/dev/null
kill -9 $(lsof -ti:3003) 2>/dev/null
sleep 1

echo "Clearing caches..."
rm -rf apps/web/.next
rm -rf apps/attendee/.next
rm -rf apps/meetings/.next
rm -rf apps/sponsor/.next

echo "Done. Run ./dev.sh to restart all servers."
