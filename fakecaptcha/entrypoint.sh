#!/bin/sh
# Initialize db.json if the volume is empty
if [ ! -f /app/fakecaptcha/db/db.json ]; then
  echo '{"equipos": {}, "codes": {}}' > /app/fakecaptcha/db/db.json
fi
exec "$@"
